// SPDX-License-Identifier: MIT
pragma solidity 0.8.29;

import {console} from "forge-std/Script.sol";

import {MarginCall} from "../src/MarginCall.sol";
import {MockNvdaC} from "../test/margincall/PositionNftTestDoubles.sol";
import {LocalHarnessBase} from "./LocalHarnessBase.sol";

/// @title SpotPositionLifecycle
/// @notice Local-Anvil-only smoke harness: an ordinary EOA opens, inspects, and closes a spot Position NFT.
/// @dev Requires `MARGIN_CALL_PRIVATE_KEY` at runtime. Never logs, persists, or hardcodes that key.
contract SpotPositionLifecycle is LocalHarnessBase {
    /// @dev Only what the `_inspect*` steps read. Everything else stays a `run()` local.
    struct RunState {
        address signer;
        MockNvdaC nvdac;
        MarginCall marginCall;
        uint256 stockAmount;
        uint256 tokenId;
    }

    function run() external {
        _requireLocalAnvil();

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

        console.log("--- tx: deploy mock stack (fail-closed router) ---");
        // Spot opens never call the router, so any swap attempt must fail closed.
        (MockNvdaC nvdac,,,, MarginCall marginCall,, uint256 nvdaAssetId) = _deployMockStack(state.signer, true);
        state.nvdac = nvdac;
        state.marginCall = marginCall;
        console.log("nvdac", address(state.nvdac));
        console.log("marginCall", address(state.marginCall));

        console.log("--- tx: mint local NVDAc to signer ---");
        state.nvdac.mint(state.signer, state.stockAmount);
        assertEq(state.nvdac.balanceOf(state.signer), state.stockAmount, "signer balance after mint");
        assertEq(state.nvdac.balanceOf(address(state.marginCall)), 0, "custody before open");

        console.log("--- tx: approve MarginCall ---");
        state.nvdac.approve(address(state.marginCall), state.stockAmount);

        console.log("--- tx: openPosition ---");
        state.tokenId =
            state.marginCall.openPosition(nvdaAssetId, state.stockAmount, state.marginCall.SPOT_LEVERAGE(), 0, "");
        _inspectOpen(state);

        console.log("--- tx: closePosition ---");
        state.marginCall.closePosition(state.tokenId);

        vm.stopBroadcast();

        _inspectClose(state);
        console.log("=== PASS: approve -> open -> inspect -> close -> burn + returned NVDAc ===");
    }

    function _inspectOpen(RunState memory state) internal view {
        address nftOwner = state.marginCall.ownerOf(state.tokenId);
        MarginCall.Position memory pos = state.marginCall.positions(state.tokenId);
        uint256 currentDebt = state.marginCall.currentDebt(state.tokenId);
        uint256 custody = state.nvdac.balanceOf(address(state.marginCall));
        uint256 signerNvda = state.nvdac.balanceOf(state.signer);

        console.log("--- inspect after open ---");
        console.log("tokenId", state.tokenId);
        console.log("ownerOf", nftOwner);
        console.log("assetId", pos.assetId);
        console.log("recorded stockAmount", pos.stockAmount);
        console.log("principal", pos.principal);
        console.log("accruedInterest", pos.accruedInterest);
        console.log("lastAccruedAt", pos.lastAccruedAt);
        console.log("executor", pos.executor);
        console.log("currentDebt", currentDebt);
        console.log("MarginCall NVDAc custody", custody);
        console.log("signer NVDAc balance", signerNvda);

        assertEq(nftOwner, state.signer, "ownerOf");
        assertEq(pos.assetId, 1, "assetId");
        assertEq(pos.stockAmount, state.stockAmount, "recorded stockAmount");
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
}
