// SPDX-License-Identifier: MIT
pragma solidity 0.8.29;

import {Script, console} from "forge-std/Script.sol";
import {StdAssertions} from "forge-std/StdAssertions.sol";
import {IERC721Errors} from "@openzeppelin/contracts/interfaces/draft-IERC6093.sol";

import {CreditPool} from "../src/CreditPool.sol";
import {ExecutionAdapter} from "../src/ExecutionAdapter.sol";
import {IOracleAdapter} from "../src/interfaces/IOracleAdapter.sol";
import {IUniswapV3SwapRouter} from "../src/interfaces/IUniswapV3SwapRouter.sol";
import {MarginCall} from "../src/MarginCall.sol";
import {BaseV1Constants} from "../test/fixtures/BaseV1Constants.sol";
import {MockOracleAdapter} from "../test/margincall/PositionNftTestDoubles.sol";
import {LocalNvdaC} from "./LocalNvdaC.sol";
import {LocalUsdc} from "./LocalUsdc.sol";

/// @dev Spot opens never call the router; any swap attempt fails closed.
contract RevertingSwapRouter is IUniswapV3SwapRouter {
    error RouterUnusedOnSpotPath();

    function exactInputSingle(ExactInputSingleParams calldata) external payable returns (uint256) {
        revert RouterUnusedOnSpotPath();
    }
}

/// @title SpotPositionLifecycle
/// @notice Local-Anvil-only smoke harness: an ordinary EOA opens, inspects, and closes a spot Position NFT.
/// @dev Requires `MARGIN_CALL_PRIVATE_KEY` at runtime. Never logs, persists, or hardcodes that key.
contract SpotPositionLifecycle is Script, StdAssertions {
    uint256 internal constant ANVIL_CHAIN_ID = 31337;
    uint256 internal constant DEFAULT_STOCK_AMOUNT = 1e8;

    error LocalAnvilOnly(uint256 actualChainId, uint256 requiredChainId);
    error ZeroStockAmount();
    error NftStillExists(uint256 tokenId, address owner);
    error UnexpectedOwnerOfRevert(uint256 tokenId, bytes data);

    struct RunState {
        address signer;
        LocalNvdaC nvdac;
        LocalUsdc usdc;
        MockOracleAdapter oracle;
        ExecutionAdapter execution;
        CreditPool pool;
        MarginCall marginCall;
        uint256 stockAmount;
        uint256 tokenId;
    }

    function run() external {
        if (block.chainid != ANVIL_CHAIN_ID) {
            revert LocalAnvilOnly(block.chainid, ANVIL_CHAIN_ID);
        }

        uint256 privateKey = vm.envUint("MARGIN_CALL_PRIVATE_KEY");
        RunState memory state;
        state.signer = vm.addr(privateKey);
        state.stockAmount = vm.envOr("MARGIN_CALL_STOCK_AMOUNT", DEFAULT_STOCK_AMOUNT);
        if (state.stockAmount == 0) {
            revert ZeroStockAmount();
        }

        console.log("=== LOCAL ONLY: spot Position NFT signer smoke test ===");
        console.log("chainId", block.chainid);
        console.log("signer", state.signer);
        console.log("stockAmount (raw NVDAc units)", state.stockAmount);
        console.log("Broadcast artifact: broadcast/SpotPositionLifecycle.s.sol/31337/run-latest.json");

        vm.startBroadcast(privateKey);

        console.log("--- tx: deploy LocalNvdaC (dev/test-only) ---");
        state.nvdac = new LocalNvdaC();
        console.log("nvdac", address(state.nvdac));

        console.log("--- tx: deploy LocalUsdc + oracle + unused router + adapters ---");
        state.usdc = new LocalUsdc();
        state.oracle = new MockOracleAdapter();
        RevertingSwapRouter router = new RevertingSwapRouter();
        state.execution = new ExecutionAdapter(
            address(state.usdc), address(state.nvdac), address(router), BaseV1Constants.UNISWAP_FEE
        );
        state.marginCall =
            new MarginCall(address(state.nvdac), address(state.usdc), address(state.oracle), address(state.execution));
        state.pool = new CreditPool(address(state.usdc), address(state.marginCall));
        state.marginCall.setCreditPool(address(state.pool));
        state.oracle.setObservation(IOracleAdapter.State.LIVE, BaseV1Constants.PINNED_FEED_ANSWER, 1, block.timestamp);
        console.log("marginCall", address(state.marginCall));

        console.log("--- tx: mint local NVDAc to signer ---");
        state.nvdac.mint(state.signer, state.stockAmount);
        assertEq(state.nvdac.balanceOf(state.signer), state.stockAmount, "signer balance after mint");
        assertEq(state.nvdac.balanceOf(address(state.marginCall)), 0, "custody before open");

        console.log("--- tx: approve MarginCall ---");
        state.nvdac.approve(address(state.marginCall), state.stockAmount);

        console.log("--- tx: openPosition ---");
        state.tokenId = state.marginCall.openPosition(state.stockAmount, state.marginCall.SPOT_LEVERAGE(), 0);
        _inspectOpen(state);

        console.log("--- tx: closePosition ---");
        state.marginCall.closePosition(state.tokenId);

        vm.stopBroadcast();

        _inspectClose(state);
        console.log("=== PASS: approve -> open -> inspect -> close -> burn + returned NVDAc ===");
    }

    function _inspectOpen(RunState memory state) internal view {
        address nftOwner = state.marginCall.ownerOf(state.tokenId);
        (uint256 recordedStock, uint256 principal, uint256 accruedInterest, uint256 lastAccruedAt, address executor) =
            state.marginCall.positions(state.tokenId);
        uint256 currentDebt = state.marginCall.currentDebt(state.tokenId);
        uint256 custody = state.nvdac.balanceOf(address(state.marginCall));
        uint256 signerNvda = state.nvdac.balanceOf(state.signer);

        console.log("--- inspect after open ---");
        console.log("tokenId", state.tokenId);
        console.log("ownerOf", nftOwner);
        console.log("recorded stockAmount", recordedStock);
        console.log("principal", principal);
        console.log("accruedInterest", accruedInterest);
        console.log("lastAccruedAt", lastAccruedAt);
        console.log("executor", executor);
        console.log("currentDebt", currentDebt);
        console.log("MarginCall NVDAc custody", custody);
        console.log("signer NVDAc balance", signerNvda);

        assertEq(nftOwner, state.signer, "ownerOf");
        assertEq(recordedStock, state.stockAmount, "recorded stockAmount");
        assertEq(custody, state.stockAmount, "custody holds the deposit");
        assertEq(signerNvda, 0, "signer debited on open");
    }

    function _inspectClose(RunState memory state) internal view {
        console.log("--- inspect after close ---");
        _assertTokenDoesNotExist(state.marginCall, state.tokenId);
        console.log("NFT no longer exists");

        uint256 custody = state.nvdac.balanceOf(address(state.marginCall));
        uint256 signerNvda = state.nvdac.balanceOf(state.signer);
        console.log("MarginCall NVDAc custody", custody);
        console.log("signer NVDAc balance", signerNvda);

        assertEq(custody, 0, "final custody");
        assertEq(signerNvda, state.stockAmount, "signer received the deposit back");
    }

    function _assertTokenDoesNotExist(MarginCall marginCall, uint256 tokenId) internal view {
        bytes memory expected = abi.encodeWithSelector(IERC721Errors.ERC721NonexistentToken.selector, tokenId);
        (bool success, bytes memory data) =
            address(marginCall).staticcall(abi.encodeCall(marginCall.ownerOf, (tokenId)));
        if (success) {
            revert NftStillExists(tokenId, abi.decode(data, (address)));
        }
        if (keccak256(data) != keccak256(expected)) {
            revert UnexpectedOwnerOfRevert(tokenId, data);
        }
    }
}
