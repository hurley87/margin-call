// SPDX-License-Identifier: MIT
pragma solidity 0.8.29;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {IERC721Receiver} from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

import {BaseV1Constants} from "../fixtures/BaseV1Constants.sol";
import {IOracleAdapter} from "../../src/interfaces/IOracleAdapter.sol";
import {IUniswapV3SwapRouter} from "../../src/interfaces/IUniswapV3SwapRouter.sol";
import {MarginCall} from "../../src/MarginCall.sol";
import {NvdaValuation} from "../valuation/NvdaValuation.sol";
import {V1Config} from "../../src/V1Config.sol";

/// @dev Standard raw-unit ERC-20 with stock 8 decimals. Not a production B20 token.
contract MockNvdaC is ERC20 {
    constructor() ERC20("MockStock", "STOCK") {}

    function decimals() public pure override returns (uint8) {
        return BaseV1Constants.NVDAC_DECIMALS;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

/// @dev Standard 6-decimal USDC stand-in for RPC-free tests.
contract MockUsdc is ERC20 {
    constructor() ERC20("USD Coin", "USDC") {}

    function decimals() public pure override returns (uint8) {
        return BaseV1Constants.USDC_DECIMALS;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

/// @dev Controllable oracle double implementing the production `IOracleAdapter` surface.
contract MockOracleAdapter is IOracleAdapter {
    address private immutable _stock;

    State public state = State.LIVE;
    uint256 public price = BaseV1Constants.PINNED_FEED_ANSWER;
    uint80 public roundId = 1;
    uint256 public updatedAt = 1_700_000_000;
    bool public shouldRevert;

    error MockOracleRevert();

    constructor(address stock_) {
        _stock = stock_;
    }

    function STOCK() external view override returns (address) {
        return _stock;
    }

    function setObservation(State state_, uint256 price_, uint80 roundId_, uint256 updatedAt_) external {
        state = state_;
        price = price_;
        roundId = roundId_;
        updatedAt = updatedAt_;
    }

    function setState(State state_) external {
        state = state_;
    }

    function setShouldRevert(bool shouldRevert_) external {
        shouldRevert = shouldRevert_;
    }

    uint256 public refreshCount;

    function latestObservation() external view override returns (Observation memory observation) {
        if (shouldRevert) {
            revert MockOracleRevert();
        }
        observation.state = state;
        observation.price = price;
        observation.roundId = roundId;
        observation.updatedAt = updatedAt;
    }

    function refresh() external override returns (Observation memory observation) {
        if (shouldRevert) {
            revert MockOracleRevert();
        }
        ++refreshCount;
        observation.state = state;
        observation.price = price;
        observation.roundId = roundId;
        observation.updatedAt = updatedAt;
    }

    function valueUsdc(uint256 stockAmountRaw, uint256 feedAnswer) external pure override returns (uint256) {
        return NvdaValuation.toUsdcRawFloor(stockAmountRaw, feedAnswer);
    }
}

/// @dev Exact-input Uniswap stand-in with configurable fill rate versus the oracle-fair amount.
///      Constructor registers one primary USDC/stock pair; additional pairs via `supportStock`.
contract MockSwapRouter is IUniswapV3SwapRouter {
    MockUsdc public immutable USDC;
    address public immutable STOCK;
    mapping(address stock => bool) public supported;
    mapping(address stock => uint256) public livePriceOf;
    /// @dev Fill as a fraction of oracle-fair output in bps. Defaults to exactly the 100 bps adverse bound.
    uint256 public fillBps = V1Config.ADVERSE_BOUND_BPS;
    bool public shouldRevert;

    error MockRouterRevert();

    constructor(MockUsdc usdc_, address stock_) {
        USDC = usdc_;
        STOCK = stock_;
        supported[stock_] = true;
        livePriceOf[stock_] = BaseV1Constants.PINNED_FEED_ANSWER;
    }

    function setFillBps(uint256 fillBps_) external {
        fillBps = fillBps_;
    }

    function setShouldRevert(bool shouldRevert_) external {
        shouldRevert = shouldRevert_;
    }

    /// @dev Sets the primary stock's live price (preserves existing single-pair call sites).
    function setLivePrice(uint256 livePrice_) external {
        livePriceOf[STOCK] = livePrice_;
    }

    function setLivePrice(address stock, uint256 livePrice_) external {
        livePriceOf[stock] = livePrice_;
    }

    function supportStock(address stock, uint256 price) external {
        supported[stock] = true;
        livePriceOf[stock] = price;
    }

    /// @dev Legacy single-pair read used by older tests that still query `livePrice`.
    function livePrice() external view returns (uint256) {
        return livePriceOf[STOCK];
    }

    function exactInputSingle(ExactInputSingleParams calldata params) external payable returns (uint256 amountOut) {
        if (shouldRevert) {
            revert MockRouterRevert();
        }
        if (params.tokenIn == address(USDC) && supported[params.tokenOut]) {
            require(USDC.transferFrom(msg.sender, address(this), params.amountIn), "usdc in");
            uint256 price = livePriceOf[params.tokenOut];
            amountOut = Math.mulDiv(
                params.amountIn,
                V1Config.VALUATION_DENOMINATOR * fillBps,
                price * BaseV1Constants.BPS_DENOMINATOR,
                Math.Rounding.Ceil
            );
            require(amountOut >= params.amountOutMinimum, "Too little received");
            MockNvdaC(params.tokenOut).mint(params.recipient, amountOut);
            return amountOut;
        }
        if (supported[params.tokenIn] && params.tokenOut == address(USDC)) {
            require(MockNvdaC(params.tokenIn).transferFrom(msg.sender, address(this), params.amountIn), "stock in");
            uint256 price = livePriceOf[params.tokenIn];
            amountOut = Math.mulDiv(
                params.amountIn,
                price * fillBps,
                V1Config.VALUATION_DENOMINATOR * BaseV1Constants.BPS_DENOMINATOR,
                Math.Rounding.Ceil
            );
            require(amountOut >= params.amountOutMinimum, "Too little received");
            USDC.mint(params.recipient, amountOut);
            return amountOut;
        }
        revert("unsupported pair");
    }
}

/// @dev `transferFrom` returns `false` without mutating balances.
contract FalseReturningNvdaC {
    function approve(address, uint256) external pure returns (bool) {
        return true;
    }

    function transferFrom(address, address, uint256) external pure returns (bool) {
        return false;
    }
}

/// @dev `transferFrom` reverts. Used to prove `openPosition` rolls back on a throwing token.
contract RevertingNvdaC {
    error TransferFailed();

    function approve(address, uint256) external pure returns (bool) {
        return true;
    }

    function transferFrom(address, address, uint256) external pure returns (bool) {
        revert TransferFailed();
    }
}

/// @dev Shared rig for the receiver doubles. Only `onERC721Received` legitimately varies between them, so the
///      custody state, the constructor, and the open flow live here once.
abstract contract SpotOpener {
    MarginCall public immutable marginCall;
    MockNvdaC public immutable nvdac;
    uint256 public immutable assetId;

    constructor(MarginCall marginCall_, MockNvdaC nvdac_, uint256 assetId_) {
        marginCall = marginCall_;
        nvdac = nvdac_;
        assetId = assetId_;
    }

    function openSpot(uint256 stockAmount) external returns (uint256 tokenId) {
        nvdac.approve(address(marginCall), stockAmount);
        return marginCall.openPosition(assetId, stockAmount, marginCall.SPOT_LEVERAGE(), 0, "");
    }
}

/// @dev Records MarginCall state observed inside `onERC721Received` during `_safeMint`.
contract InspectingReceiver is SpotOpener, IERC721Receiver {
    address public observedOwner;
    uint256 public observedAssetId;
    uint256 public observedStockAmount;
    uint256 public observedPrincipal;
    uint256 public observedAccruedInterest;
    uint256 public observedLastAccruedAt;
    address public observedExecutor;
    uint256 public observedCustody;
    uint256 public observedDebt;

    constructor(MarginCall marginCall_, MockNvdaC nvdac_, uint256 assetId_) SpotOpener(marginCall_, nvdac_, assetId_) {}

    function onERC721Received(address, address, uint256 tokenId, bytes calldata) external returns (bytes4) {
        observedOwner = marginCall.ownerOf(tokenId);
        MarginCall.Position memory position = marginCall.positions(tokenId);
        observedAssetId = position.assetId;
        observedStockAmount = position.stockAmount;
        observedPrincipal = position.principal;
        observedAccruedInterest = position.accruedInterest;
        observedLastAccruedAt = position.lastAccruedAt;
        observedExecutor = position.executor;
        observedDebt = marginCall.currentDebt(tokenId);
        observedCustody = nvdac.balanceOf(address(marginCall));
        return IERC721Receiver.onERC721Received.selector;
    }
}

/// @dev Calls `repay` as itself so a transfer-callback receiver can invoke it as the stale executor.
contract ExecutorRepayCaller {
    MarginCall public immutable marginCall;
    MockUsdc public immutable usdc;

    bool public repayReverted;
    bytes public repayRevertData;

    constructor(MarginCall marginCall_, MockUsdc usdc_) {
        marginCall = marginCall_;
        usdc = usdc_;
    }

    function attemptRepay(uint256 tokenId, uint256 amount) external {
        usdc.approve(address(marginCall), amount);
        try marginCall.repay(tokenId, amount) {
            repayReverted = false;
        } catch (bytes memory reason) {
            repayReverted = true;
            repayRevertData = reason;
        }
    }
}

/// @dev Safe-transfer receiver that records cleared executor state and has the stale executor attempt repay.
contract TransferCallbackExecutorGuard is IERC721Receiver {
    MarginCall public immutable marginCall;
    ExecutorRepayCaller public immutable staleExecutor;

    address public observedOwner;
    address public observedExecutor;
    bool public sawClearedExecutor;
    bool public sawStaleRepayRevert;
    bytes public staleRepayRevertData;

    constructor(MarginCall marginCall_, ExecutorRepayCaller staleExecutor_) {
        marginCall = marginCall_;
        staleExecutor = staleExecutor_;
    }

    function onERC721Received(address, address, uint256 tokenId, bytes calldata) external returns (bytes4) {
        observedOwner = marginCall.ownerOf(tokenId);
        observedExecutor = marginCall.positions(tokenId).executor;
        sawClearedExecutor = observedExecutor == address(0);

        uint256 debt = marginCall.currentDebt(tokenId);
        if (debt > 0) {
            staleExecutor.attemptRepay(tokenId, debt);
            sawStaleRepayRevert = staleExecutor.repayReverted();
            staleRepayRevertData = staleExecutor.repayRevertData();
        }
        return IERC721Receiver.onERC721Received.selector;
    }
}

/// @dev Closes the minted token during the safe-mint receiver callback.
contract CallbackCloser is SpotOpener, IERC721Receiver {
    bool public didClose;

    constructor(MarginCall marginCall_, MockNvdaC nvdac_, uint256 assetId_) SpotOpener(marginCall_, nvdac_, assetId_) {}

    function onERC721Received(address, address, uint256 tokenId, bytes calldata) external returns (bytes4) {
        marginCall.closePosition(tokenId);
        didClose = true;
        return IERC721Receiver.onERC721Received.selector;
    }
}

/// @dev Transfers the minted token during the safe-mint receiver callback.
contract CallbackTransferrer is SpotOpener, IERC721Receiver {
    address public immutable recipient;

    constructor(MarginCall marginCall_, MockNvdaC nvdac_, uint256 assetId_, address recipient_)
        SpotOpener(marginCall_, nvdac_, assetId_)
    {
        recipient = recipient_;
    }

    function onERC721Received(address, address, uint256 tokenId, bytes calldata) external returns (bytes4) {
        IERC721(msg.sender).transferFrom(address(this), recipient, tokenId);
        return IERC721Receiver.onERC721Received.selector;
    }
}

contract RevertingReceiver is SpotOpener, IERC721Receiver {
    error Rejected();

    constructor(MarginCall marginCall_, MockNvdaC nvdac_, uint256 assetId_) SpotOpener(marginCall_, nvdac_, assetId_) {}

    function onERC721Received(address, address, uint256, bytes calldata) external pure returns (bytes4) {
        revert Rejected();
    }
}

contract InvalidSelectorReceiver is SpotOpener, IERC721Receiver {
    constructor(MarginCall marginCall_, MockNvdaC nvdac_, uint256 assetId_) SpotOpener(marginCall_, nvdac_, assetId_) {}

    function onERC721Received(address, address, uint256, bytes calldata) external pure returns (bytes4) {
        return bytes4(0xdeadbeef);
    }
}

/// @dev Has code but does not implement `IERC721Receiver`.
contract NonReceiver {
    function openSpot(MarginCall marginCall, MockNvdaC nvdac, uint256 assetId, uint256 stockAmount)
        external
        returns (uint256 tokenId)
    {
        nvdac.approve(address(marginCall), stockAmount);
        return marginCall.openPosition(assetId, stockAmount, marginCall.SPOT_LEVERAGE(), 0, "");
    }
}
