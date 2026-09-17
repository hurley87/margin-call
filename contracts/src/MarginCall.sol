// SPDX-License-Identifier: MIT
pragma solidity 0.8.29;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {Base64} from "@openzeppelin/contracts/utils/Base64.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";

import {ICreditPool} from "./interfaces/ICreditPool.sol";
import {IExecutionAdapter} from "./interfaces/IExecutionAdapter.sol";
import {IOracleAdapter} from "./interfaces/IOracleAdapter.sol";
import {V1Config} from "./V1Config.sol";

/// @title MarginCall
/// @notice Position NFT coordinator: custody NVDAc, open spot or financed positions, and mint ERC-721 ownership.
/// @dev `MarginCall` is the ERC-721. Token existence is the active-position status. Repay, reduceExposure, executor,
///      and liquidation are later slices. Borrowed USDC can only buy NVDAc through the fixed Uniswap execution path.
contract MarginCall is ERC721 {
    using SafeERC20 for IERC20;

    struct Position {
        uint256 stockAmount;
        uint256 principal;
        uint256 accruedInterest;
        uint256 lastAccruedAt;
        address executor;
    }

    error ZeroAddress();
    error ZeroStockAmount();
    error UnsupportedLeverage(uint256 targetLeverage);
    error InvalidMinNvdaOut(uint256 minNvdaOut);
    error NotPositionOwner(address caller, address owner);
    error DebtOutstanding(uint256 tokenId);
    error CreditPoolAlreadySet();
    error InvalidCreditPool();
    error OracleNotLive(IOracleAdapter.State state);
    error ContributionTooSmall(uint256 contributionValue);
    error LeverageExceeded(uint256 targetLeverage, uint256 nav, uint256 debt);

    event PositionOpened(uint256 indexed tokenId, address indexed owner, uint256 stockAmount);
    event CreditDrawn(uint256 indexed tokenId, uint256 usdcAmount);
    event PositionClosed(uint256 indexed tokenId, address indexed owner, uint256 stockAmount);
    event CreditPoolSet(address indexed creditPool);

    /// @notice 1.0x opening leverage in basis points (`10_000` = 1x).
    uint256 public constant SPOT_LEVERAGE = V1Config.SPOT_LEVERAGE;
    uint256 public constant BPS_DENOMINATOR = V1Config.BPS_DENOMINATOR;
    uint256 public constant MAX_OPENING_LEVERAGE = V1Config.LEVERAGE_1_5X;

    IERC20 public immutable NVDAC;
    IERC20 public immutable USDC;
    IOracleAdapter public immutable ORACLE;
    IExecutionAdapter public immutable EXECUTION;

    ICreditPool public creditPool;

    mapping(uint256 tokenId => Position) public positions;

    uint256 private _nextTokenId;

    constructor(address nvdac_, address usdc_, address oracle_, address execution_)
        ERC721("Margin Call Position", "MCP")
    {
        if (nvdac_ == address(0) || usdc_ == address(0) || oracle_ == address(0) || execution_ == address(0)) {
            revert ZeroAddress();
        }
        NVDAC = IERC20(nvdac_);
        USDC = IERC20(usdc_);
        ORACLE = IOracleAdapter(oracle_);
        EXECUTION = IExecutionAdapter(execution_);
    }

    /// @notice One-time wire of the protocol USDC pool. Validates immutable borrower and USDC match.
    function setCreditPool(address creditPool_) external {
        if (address(creditPool) != address(0)) {
            revert CreditPoolAlreadySet();
        }
        if (creditPool_ == address(0)) {
            revert ZeroAddress();
        }
        ICreditPool pool = ICreditPool(creditPool_);
        if (address(pool.USDC()) != address(USDC) || pool.borrower() != address(this)) {
            revert InvalidCreditPool();
        }
        creditPool = pool;
        emit CreditPoolSet(creditPool_);
    }

    /// @notice Deposit `stockAmount` raw NVDAc at a V1 opening preset and mint a Position NFT to the caller.
    /// @dev Spot (`1.0x`) is oracle-free and requires `minNvdaOut == 0`. Financed presets require `LIVE` pricing,
    ///      draw USDC from `CreditPool`, buy NVDAc through Uniswap, and mint only after post-execution leverage checks.
    ///      Position state and events are committed before `_safeMint`.
    function openPosition(uint256 stockAmount, uint256 targetLeverage, uint256 minNvdaOut)
        external
        returns (uint256 tokenId)
    {
        if (stockAmount == 0) {
            revert ZeroStockAmount();
        }
        if (!V1Config.isSupportedOpeningLeverage(targetLeverage)) {
            revert UnsupportedLeverage(targetLeverage);
        }

        NVDAC.safeTransferFrom(msg.sender, address(this), stockAmount);

        uint256 finalStock = stockAmount;
        uint256 principal;

        if (targetLeverage == SPOT_LEVERAGE) {
            if (minNvdaOut != 0) {
                revert InvalidMinNvdaOut(minNvdaOut);
            }
        } else {
            (finalStock, principal) = _openFinanced(stockAmount, targetLeverage, minNvdaOut);
        }

        tokenId = ++_nextTokenId;
        Position storage position = positions[tokenId];
        position.stockAmount = finalStock;
        position.lastAccruedAt = block.timestamp;

        emit PositionOpened(tokenId, msg.sender, finalStock);
        if (principal != 0) {
            position.principal = principal;
            emit CreditDrawn(tokenId, principal);
        }
        _safeMint(msg.sender, tokenId);
    }

    /// @notice Owner-only close of a debt-free position. Returns this token's recorded NVDAc and burns the NFT.
    function closePosition(uint256 tokenId) external {
        address owner = _requireOwned(tokenId);
        if (msg.sender != owner) {
            revert NotPositionOwner(msg.sender, owner);
        }
        if (currentDebt(tokenId) != 0) {
            revert DebtOutstanding(tokenId);
        }

        uint256 stockAmount = positions[tokenId].stockAmount;
        delete positions[tokenId];
        _burn(tokenId);

        NVDAC.safeTransfer(owner, stockAmount);

        emit PositionClosed(tokenId, owner, stockAmount);
    }

    /// @notice Stored principal plus accrued interest checkpoint. Spot opens at zero debt; financed opens set principal.
    /// @dev Full lazy 10% APR accrual is a later slice. This slice stores opening principal with zero accrued interest.
    function currentDebt(uint256 tokenId) public view returns (uint256) {
        Position storage position = positions[tokenId];
        return position.principal + position.accruedInterest;
    }

    /// @notice Minimal identity metadata for a live Position NFT. Full living presentation is owned by a later slice.
    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        string memory json = string.concat(
            '{"name":"Margin Call Position ', Strings.toString(tokenId), '","description":"NVDAc Position NFT"}'
        );
        return string.concat("data:application/json;base64,", Base64.encode(bytes(json)));
    }

    /// @dev Clear the executor on a real ownership transfer before any `safeTransferFrom` receiver callback.
    function _update(address to, uint256 tokenId, address auth) internal override returns (address from) {
        from = super._update(to, tokenId, auth);
        if (from != address(0) && to != address(0) && from != to) {
            positions[tokenId].executor = address(0);
        }
    }

    function _openFinanced(uint256 contributedStock, uint256 targetLeverage, uint256 minNvdaOut)
        private
        returns (uint256 finalStock, uint256 principal)
    {
        ICreditPool pool = creditPool;
        if (address(pool) == address(0)) {
            revert InvalidCreditPool();
        }

        IOracleAdapter.Observation memory observation = ORACLE.latestObservation();
        if (observation.state != IOracleAdapter.State.LIVE) {
            revert OracleNotLive(observation.state);
        }

        uint256 contributionValue = ORACLE.valueUsdc(contributedStock, observation.price);
        principal = _sizePrincipal(contributionValue, targetLeverage);
        if (principal == 0) {
            revert ContributionTooSmall(contributionValue);
        }

        // Capacity is the pool's invariant: `draw` re-checks and reverts, so a pre-read here would only
        // duplicate the rule and pay a second `balanceOf`.
        pool.draw(principal);

        USDC.forceApprove(address(EXECUTION), principal);
        uint256 bought = EXECUTION.buyNvda(principal, minNvdaOut, observation.price);
        USDC.forceApprove(address(EXECUTION), 0);

        finalStock = contributedStock + bought;
        uint256 nav = ORACLE.valueUsdc(finalStock, observation.price);
        _requireLeverageWithinCeiling(nav, principal, targetLeverage);
    }

    /// @dev Haircut ideal principal by the 100 bps adverse execution bound so post-swap leverage stays under the preset.
    function _sizePrincipal(uint256 contributionValue, uint256 targetLeverage) private pure returns (uint256) {
        uint256 ideal =
            Math.mulDiv(contributionValue, targetLeverage - BPS_DENOMINATOR, BPS_DENOMINATOR, Math.Rounding.Floor);
        return Math.mulDiv(ideal, V1Config.ADVERSE_BOUND_BPS, V1Config.BPS_DENOMINATOR, Math.Rounding.Floor);
    }

    /// @dev Enforce `nav / (nav - debt) <= targetLeverage` without division by zero. `targetLeverage` is already
    ///      restricted to the V1 presets, which top out at `MAX_OPENING_LEVERAGE`.
    function _requireLeverageWithinCeiling(uint256 nav, uint256 debt, uint256 targetLeverage) private pure {
        if (debt >= nav) {
            revert LeverageExceeded(targetLeverage, nav, debt);
        }
        // nav / (nav - debt) <= L  <=>  nav * BPS <= (nav - debt) * L
        if (nav * BPS_DENOMINATOR > (nav - debt) * targetLeverage) {
            revert LeverageExceeded(targetLeverage, nav, debt);
        }
    }
}
