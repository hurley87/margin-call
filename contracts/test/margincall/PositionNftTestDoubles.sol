// SPDX-License-Identifier: MIT
pragma solidity 0.8.29;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {IERC721Receiver} from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

import {BaseV1Constants} from "../fixtures/BaseV1Constants.sol";
import {IOracleAdapter} from "../../src/interfaces/IOracleAdapter.sol";
import {IUniswapV3SwapRouter} from "../../src/interfaces/IUniswapV3SwapRouter.sol";
import {MarginCall} from "../../src/MarginCall.sol";
import {V1Config} from "../../src/V1Config.sol";

/// @dev Standard raw-unit ERC-20 with NVDAc's 8 decimals. Not production NVDAc.
contract MockNvdaC is ERC20 {
    constructor() ERC20("NVDAc", "NVDAc") {}

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
    State public state = State.LIVE;
    uint256 public price = BaseV1Constants.PINNED_FEED_ANSWER;
    uint80 public roundId = 1;
    uint256 public updatedAt = 1_700_000_000;

    function setObservation(State state_, uint256 price_, uint80 roundId_, uint256 updatedAt_) external {
        state = state_;
        price = price_;
        roundId = roundId_;
        updatedAt = updatedAt_;
    }

    function setState(State state_) external {
        state = state_;
    }

    function setPrice(uint256 price_) external {
        price = price_;
    }

    function latestObservation() external view override returns (Observation memory observation) {
        observation.state = state;
        observation.price = price;
        observation.roundId = roundId;
        observation.updatedAt = updatedAt;
    }

    function valueUsdc(uint256 stockAmountRaw, uint256 feedAnswer) external pure override returns (uint256) {
        return Math.mulDiv(stockAmountRaw, feedAnswer, V1Config.VALUATION_DENOMINATOR, Math.Rounding.Floor);
    }
}

/// @dev Exact-input Uniswap stand-in with configurable fill rate versus the oracle-fair amount.
contract MockSwapRouter is IUniswapV3SwapRouter {
    IERC20 public immutable USDC;
    MockNvdaC public immutable NVDAC;
    MockUsdc public immutable USDC_MINTABLE;
    /// @dev Fill as a fraction of oracle-fair output in bps. `9900` = 100 bps adverse.
    uint256 public fillBps = 9_900;
    bool public shouldRevert;
    uint256 public livePrice = BaseV1Constants.PINNED_FEED_ANSWER;

    error MockRouterRevert();

    constructor(MockUsdc usdc_, MockNvdaC nvdac_) {
        USDC = IERC20(address(usdc_));
        USDC_MINTABLE = usdc_;
        NVDAC = nvdac_;
    }

    function setFillBps(uint256 fillBps_) external {
        fillBps = fillBps_;
    }

    function setShouldRevert(bool shouldRevert_) external {
        shouldRevert = shouldRevert_;
    }

    function setLivePrice(uint256 livePrice_) external {
        livePrice = livePrice_;
    }

    function exactInputSingle(ExactInputSingleParams calldata params) external payable returns (uint256 amountOut) {
        if (shouldRevert) {
            revert MockRouterRevert();
        }
        if (params.tokenIn == address(USDC) && params.tokenOut == address(NVDAC)) {
            require(USDC.transferFrom(msg.sender, address(this), params.amountIn), "usdc in");
            // Match ExecutionAdapter's ceil-bound formula so a `fillBps` of 9900 clears the protocol floor.
            amountOut = Math.mulDiv(
                params.amountIn,
                V1Config.VALUATION_DENOMINATOR * fillBps,
                livePrice * BaseV1Constants.BPS_DENOMINATOR,
                Math.Rounding.Ceil
            );
            require(amountOut >= params.amountOutMinimum, "Too little received");
            NVDAC.mint(params.recipient, amountOut);
            return amountOut;
        }
        if (params.tokenIn == address(NVDAC) && params.tokenOut == address(USDC)) {
            require(NVDAC.transferFrom(msg.sender, address(this), params.amountIn), "nvda in");
            amountOut = Math.mulDiv(
                params.amountIn,
                livePrice * fillBps,
                V1Config.VALUATION_DENOMINATOR * BaseV1Constants.BPS_DENOMINATOR,
                Math.Rounding.Ceil
            );
            require(amountOut >= params.amountOutMinimum, "Too little received");
            USDC_MINTABLE.mint(params.recipient, amountOut);
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

    constructor(MarginCall marginCall_, MockNvdaC nvdac_) {
        marginCall = marginCall_;
        nvdac = nvdac_;
    }

    function openSpot(uint256 stockAmount) external returns (uint256 tokenId) {
        nvdac.approve(address(marginCall), stockAmount);
        return marginCall.openPosition(stockAmount, marginCall.SPOT_LEVERAGE(), 0);
    }
}

/// @dev Records MarginCall state observed inside `onERC721Received` during `_safeMint`.
contract InspectingReceiver is SpotOpener, IERC721Receiver {
    address public observedOwner;
    uint256 public observedStockAmount;
    uint256 public observedPrincipal;
    uint256 public observedAccruedInterest;
    uint256 public observedLastAccruedAt;
    address public observedExecutor;
    uint256 public observedCustody;
    uint256 public observedDebt;

    constructor(MarginCall marginCall_, MockNvdaC nvdac_) SpotOpener(marginCall_, nvdac_) {}

    function onERC721Received(address, address, uint256 tokenId, bytes calldata) external returns (bytes4) {
        observedOwner = marginCall.ownerOf(tokenId);
        (observedStockAmount, observedPrincipal, observedAccruedInterest, observedLastAccruedAt, observedExecutor) =
            marginCall.positions(tokenId);
        observedDebt = marginCall.currentDebt(tokenId);
        observedCustody = nvdac.balanceOf(address(marginCall));
        return IERC721Receiver.onERC721Received.selector;
    }
}

/// @dev Closes the minted token during the safe-mint receiver callback.
contract CallbackCloser is SpotOpener, IERC721Receiver {
    bool public didClose;

    constructor(MarginCall marginCall_, MockNvdaC nvdac_) SpotOpener(marginCall_, nvdac_) {}

    function onERC721Received(address, address, uint256 tokenId, bytes calldata) external returns (bytes4) {
        marginCall.closePosition(tokenId);
        didClose = true;
        return IERC721Receiver.onERC721Received.selector;
    }
}

/// @dev Transfers the minted token during the safe-mint receiver callback.
contract CallbackTransferrer is SpotOpener, IERC721Receiver {
    address public immutable recipient;

    constructor(MarginCall marginCall_, MockNvdaC nvdac_, address recipient_) SpotOpener(marginCall_, nvdac_) {
        recipient = recipient_;
    }

    function onERC721Received(address, address, uint256 tokenId, bytes calldata) external returns (bytes4) {
        IERC721(msg.sender).transferFrom(address(this), recipient, tokenId);
        return IERC721Receiver.onERC721Received.selector;
    }
}

contract RevertingReceiver is SpotOpener, IERC721Receiver {
    error Rejected();

    constructor(MarginCall marginCall_, MockNvdaC nvdac_) SpotOpener(marginCall_, nvdac_) {}

    function onERC721Received(address, address, uint256, bytes calldata) external pure returns (bytes4) {
        revert Rejected();
    }
}

contract InvalidSelectorReceiver is SpotOpener, IERC721Receiver {
    constructor(MarginCall marginCall_, MockNvdaC nvdac_) SpotOpener(marginCall_, nvdac_) {}

    function onERC721Received(address, address, uint256, bytes calldata) external pure returns (bytes4) {
        return bytes4(0xdeadbeef);
    }
}

/// @dev Has code but does not implement `IERC721Receiver`.
contract NonReceiver {
    function openSpot(MarginCall marginCall, MockNvdaC nvdac, uint256 stockAmount) external returns (uint256 tokenId) {
        nvdac.approve(address(marginCall), stockAmount);
        return marginCall.openPosition(stockAmount, marginCall.SPOT_LEVERAGE(), 0);
    }
}
