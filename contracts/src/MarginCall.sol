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
/// @dev `MarginCall` is the ERC-721. Token existence is the active-position status. The owner may appoint one
///      executor per position via `setExecutor`. `reduceExposure` sells exact NVDAc to repay debt; liquidation is
///      a later slice. Borrowed USDC can only buy NVDAc through the fixed Uniswap execution path. Debt accrues
///      lazily at the immutable V1 10% APR; `repay` restores USDC to the pool. Real ownership transfers clear the
///      stored executor in `_update`.
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
    error ExcessStockAmount(uint256 requested, uint256 available);
    error UnsupportedLeverage(uint256 targetLeverage);
    error InvalidMinNvdaOut(uint256 minNvdaOut);
    error NotPositionOwner(address caller, address owner);
    error NotPositionManager(address caller, address owner, address executor);
    error DebtOutstanding(uint256 tokenId);
    error ZeroRepayment();
    error CreditPoolAlreadySet();
    error NotInitializer(address caller);
    error InvalidCreditPool();
    error OracleNotLive(IOracleAdapter.State state);
    error ContributionTooSmall(uint256 contributionValue);
    error LeverageExceeded(uint256 targetLeverage, uint256 nav, uint256 debt);

    event PositionOpened(uint256 indexed tokenId, address indexed owner, uint256 stockAmount);
    event CreditDrawn(uint256 indexed tokenId, uint256 usdcAmount);
    event DebtRepaid(uint256 indexed tokenId, uint256 usdcAmount);
    event ExposureReduced(uint256 indexed tokenId, uint256 stockAmount, uint256 usdcOut);
    event ExecutorUpdated(uint256 indexed tokenId, address indexed previousExecutor, address indexed newExecutor);
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

    /// @notice The deployer, and the only address permitted to wire the credit pool. Holds no other authority:
    ///         it cannot rewire the pool afterwards, move custody, or touch a position.
    address public immutable INITIALIZER;

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
        INITIALIZER = msg.sender;
    }

    /// @notice One-time wire of the protocol USDC pool. Validates immutable borrower and USDC match.
    /// @dev Restricted to `INITIALIZER`. The value checks below are on caller-supplied view functions, so without
    ///      this guard any address could front-run deployment with a conforming contract and, because
    ///      `CreditPoolAlreadySet` makes the pointer permanent, brick financed opening until redeploy.
    function setCreditPool(address creditPool_) external {
        if (msg.sender != INITIALIZER) {
            revert NotInitializer(msg.sender);
        }
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
    /// @dev Oracle-free. Financed positions must reach zero debt via `repay` or `reduceExposure` first.
    function closePosition(uint256 tokenId) external {
        address owner = _requirePositionOwner(tokenId);
        if (currentDebt(tokenId) != 0) {
            revert DebtOutstanding(tokenId);
        }

        uint256 stockAmount = positions[tokenId].stockAmount;
        delete positions[tokenId];
        _burn(tokenId);

        NVDAC.safeTransfer(owner, stockAmount);

        emit PositionClosed(tokenId, owner, stockAmount);
    }

    /// @notice Owner-only appointment of the single optional executor for `tokenId`.
    /// @dev Supports setting, replacing, and clearing (`address(0)`). Oracle-free. ERC-721 approvals and the
    ///      current executor cannot call this. Transfer clears the stored executor via `_update`.
    function setExecutor(uint256 tokenId, address executor) external {
        _requirePositionOwner(tokenId);
        Position storage position = positions[tokenId];
        address previous = position.executor;
        position.executor = executor;
        emit ExecutorUpdated(tokenId, previous, executor);
    }

    /// @notice Accrue interest, then repay up to `amount` of current debt with external USDC.
    /// @dev Oracle-free. Transfers only `min(amount, currentDebt)` from the caller; excess never leaves the wallet.
    ///      Applies payment interest-first, then principal, and restores the paid USDC to `CreditPool`.
    ///      Owner or executor may call; ERC-721 approval does not grant repay authority.
    function repay(uint256 tokenId, uint256 amount) external {
        (, Position storage position) = _requirePositionManager(tokenId);

        _accrue(position);

        uint256 payAmount = Math.min(amount, position.principal + position.accruedInterest);
        if (payAmount == 0) {
            revert ZeroRepayment();
        }

        _applyDebtPayment(position, payAmount);
        USDC.safeTransferFrom(msg.sender, address(creditPool), payAmount);

        emit DebtRepaid(tokenId, payAmount);
    }

    /// @notice Sell exact `stockAmount` of this position's NVDAc for USDC and apply proceeds to debt.
    /// @dev Accrues first, requires `LIVE` pricing, then sells through the fixed execution adapter. Enforces caller
    ///      `minOut` and the protocol oracle floor inside the adapter. Realized USDC pays interest then principal to
    ///      `CreditPool`; any surplus goes immediately to the current NFT owner (never residual position USDC).
    ///      Owner or executor may call; ERC-721 approval does not grant authority.
    function reduceExposure(uint256 tokenId, uint256 stockAmount, uint256 minOut) external {
        (address owner, Position storage position) = _requirePositionManager(tokenId);
        if (stockAmount == 0) {
            revert ZeroStockAmount();
        }
        uint256 available = position.stockAmount;
        if (stockAmount > available) {
            revert ExcessStockAmount(stockAmount, available);
        }

        _accrue(position);

        IOracleAdapter.Observation memory observation = _requireLivePrice();

        // Deduct recorded stock before the swap so a reentrant callback cannot sell the same units twice.
        // A failed swap reverts the whole transaction and restores accounting.
        position.stockAmount = available - stockAmount;

        NVDAC.forceApprove(address(EXECUTION), stockAmount);
        uint256 usdcOut = EXECUTION.sellNvda(stockAmount, minOut, observation.price);
        NVDAC.forceApprove(address(EXECUTION), 0);

        // Re-read debt after the swap: the legs are deliberately not cached across the external call.
        uint256 repayAmount = Math.min(usdcOut, position.principal + position.accruedInterest);
        if (repayAmount != 0) {
            _applyDebtPayment(position, repayAmount);
            USDC.safeTransfer(address(creditPool), repayAmount);
            emit DebtRepaid(tokenId, repayAmount);
        }

        if (usdcOut > repayAmount) {
            USDC.safeTransfer(owner, usdcOut - repayAmount);
        }

        emit ExposureReduced(tokenId, stockAmount, usdcOut);
    }

    /// @notice Principal plus accrued-interest checkpoint plus unaccrued simple interest through now.
    /// @dev Oracle-free and keeper-free. Interest is charged only while principal is outstanding, at the immutable
    ///      V1 10% APR. Spot opens stay at zero debt.
    function currentDebt(uint256 tokenId) public view returns (uint256) {
        Position storage position = positions[tokenId];
        return position.principal + position.accruedInterest + _pendingInterest(position);
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

        IOracleAdapter.Observation memory observation = _requireLivePrice();

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

    /// @dev Resolve `tokenId` and require the caller owns it. Single definition of the owner-only rule.
    function _requirePositionOwner(uint256 tokenId) private view returns (address owner) {
        owner = _requireOwned(tokenId);
        if (msg.sender != owner) {
            revert NotPositionOwner(msg.sender, owner);
        }
    }

    /// @dev Resolve `tokenId` and require the caller is its owner or appointed executor, returning both the owner
    ///      and the position pointer the management paths need. Single definition of the owner-or-executor rule:
    ///      ERC-721 approvals never grant management authority.
    function _requirePositionManager(uint256 tokenId) private view returns (address owner, Position storage position) {
        owner = _requireOwned(tokenId);
        position = positions[tokenId];
        address executor = position.executor;
        if (msg.sender != owner && msg.sender != executor) {
            revert NotPositionManager(msg.sender, owner, executor);
        }
    }

    /// @dev Fetch the current observation and admit only `LIVE` pricing. Single definition of the pricing-admission
    ///      rule, shared by financed opening and `reduceExposure` so neither can drift from the other.
    function _requireLivePrice() private view returns (IOracleAdapter.Observation memory observation) {
        observation = ORACLE.latestObservation();
        if (observation.state != IOracleAdapter.State.LIVE) {
            revert OracleNotLive(observation.state);
        }
    }

    /// @dev Apply already-accrued `payAmount` interest-first, then principal. Caller must ensure `payAmount > 0`
    ///      and `payAmount <= principal + accruedInterest`.
    function _applyDebtPayment(Position storage position, uint256 payAmount) private {
        uint256 accrued = position.accruedInterest;
        uint256 interestPay = Math.min(payAmount, accrued);
        position.accruedInterest = accrued - interestPay;
        position.principal -= payAmount - interestPay;
    }

    /// @dev Interest owed since the checkpoint, shared by the `currentDebt` view and the `_accrue` write so the two
    ///      can never disagree. Zero when principal is zero (interest is not charged without outstanding principal)
    ///      or when no time has elapsed.
    function _pendingInterest(Position storage position) private view returns (uint256) {
        uint256 principal = position.principal;
        uint256 lastAccruedAt = position.lastAccruedAt;
        if (principal == 0 || block.timestamp <= lastAccruedAt) {
            return 0;
        }
        return _unaccruedInterest(principal, block.timestamp - lastAccruedAt);
    }

    /// @dev Fold pending interest into the checkpoint and bump `lastAccruedAt`.
    ///      Checkpointing over an interval too short to accrue a whole raw USDC unit floors that remainder away
    ///      rather than carrying it forward. The loss is bounded and not worth exploiting: `repay` rejects zero
    ///      payments, so each checkpoint must retire at least one raw unit of real debt in order to discard
    ///      strictly less than one raw unit of interest — a whole transaction per micro-USDC, and the position
    ///      pays itself off long before the leak is material. Carrying the remainder exactly would need a
    ///      per-position accumulator. Pinned by `test_repeatedDustCheckpointsCannotEraseDebtBeyondPayment`.
    function _accrue(Position storage position) private {
        uint256 pending = _pendingInterest(position);
        if (pending != 0) {
            position.accruedInterest += pending;
        }
        position.lastAccruedAt = block.timestamp;
    }

    /// @dev `principal * 10% * elapsed / 365 days`, floored. Single mulDiv avoids intermediate rounding drift.
    ///      Flooring is deliberate and always resolves in the borrower's favour: a position can be undercharged by
    ///      less than one raw USDC unit per accrual, but is never overcharged and never has principal invented.
    function _unaccruedInterest(uint256 principal, uint256 elapsed) private pure returns (uint256) {
        return Math.mulDiv(
            principal,
            V1Config.BORROW_APR_BPS * elapsed,
            V1Config.BPS_DENOMINATOR * V1Config.SECONDS_PER_YEAR,
            Math.Rounding.Floor
        );
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
