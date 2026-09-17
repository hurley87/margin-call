// SPDX-License-Identifier: MIT
pragma solidity 0.8.29;

import {Script, console} from "forge-std/Script.sol";
import {IERC721Errors} from "@openzeppelin/contracts/interfaces/draft-IERC6093.sol";

import {MarginCall} from "../src/MarginCall.sol";
import {LocalNvdaC} from "./LocalNvdaC.sol";

/// @title SpotPositionLifecycle
/// @notice Local-Anvil-only smoke harness: an ordinary EOA opens, inspects, and closes a spot Position NFT.
/// @dev Requires `MARGIN_CALL_PRIVATE_KEY` at runtime. Never logs, persists, or hardcodes that key.
///      Refuses every chain other than Anvil (`31337`). Base mainnet signer flow is owned by #429.
contract SpotPositionLifecycle is Script {
    uint256 internal constant ANVIL_CHAIN_ID = 31337;
    uint256 internal constant SPOT_LEVERAGE = 10_000;
    uint256 internal constant DEFAULT_STOCK_AMOUNT = 1e8;

    error LocalAnvilOnly(uint256 actualChainId, uint256 requiredChainId);
    error CheckFailed(string label, uint256 expected, uint256 actual);
    error AddressCheckFailed(string label, address expected, address actual);
    error NftStillExists(uint256 tokenId, address owner);
    error UnexpectedOwnerOfRevert(uint256 tokenId, bytes data);

    struct RunState {
        address signer;
        LocalNvdaC nvdac;
        MarginCall marginCall;
        uint256 stockAmount;
        uint256 tokenId;
        uint256 recordedStock;
        uint256 custodyBeforeOpen;
        uint256 signerBalanceAfterMint;
        uint256 custodyAfterOpen;
        uint256 signerBalanceAfterOpen;
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
            revert CheckFailed("stockAmount", 1, 0);
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

        console.log("--- tx: deploy MarginCall ---");
        state.marginCall = new MarginCall(address(state.nvdac));
        console.log("marginCall", address(state.marginCall));

        console.log("--- tx: mint local NVDAc to signer ---");
        state.nvdac.mint(state.signer, state.stockAmount);
        state.signerBalanceAfterMint = state.nvdac.balanceOf(state.signer);
        state.custodyBeforeOpen = state.nvdac.balanceOf(address(state.marginCall));
        _eq(state.signerBalanceAfterMint, state.stockAmount, "signer balance after mint");
        _eq(state.custodyBeforeOpen, 0, "custody before open");

        console.log("--- tx: approve MarginCall ---");
        state.nvdac.approve(address(state.marginCall), state.stockAmount);

        console.log("--- tx: openPosition ---");
        state.tokenId = state.marginCall.openPosition(state.stockAmount, SPOT_LEVERAGE, 0);
        _inspectOpen(state);

        (state.recordedStock,,,,) = state.marginCall.positions(state.tokenId);
        state.custodyAfterOpen = state.nvdac.balanceOf(address(state.marginCall));
        state.signerBalanceAfterOpen = state.nvdac.balanceOf(state.signer);

        console.log("--- tx: closePosition ---");
        state.marginCall.closePosition(state.tokenId);

        vm.stopBroadcast();

        _inspectClose(state);

        console.log("=== PASS: approve -> open -> inspect -> close -> burn + returned NVDAc ===");
        console.log("Transaction hashes: broadcast/SpotPositionLifecycle.s.sol/31337/run-latest.json");
    }

    function _inspectOpen(RunState memory state) internal view {
        address nftOwner = state.marginCall.ownerOf(state.tokenId);
        (uint256 recordedStock, uint256 principal, uint256 accruedInterest, uint256 lastAccruedAt, address executor) =
            state.marginCall.positions(state.tokenId);
        uint256 currentDebt = state.marginCall.currentDebt(state.tokenId);
        uint256 custody = state.nvdac.balanceOf(address(state.marginCall));
        uint256 signerNvda = state.nvdac.balanceOf(state.signer);

        console.log("--- inspect after open ---");
        console.log("signer", state.signer);
        console.log("chainId", block.chainid);
        console.log("nvdac", address(state.nvdac));
        console.log("marginCall", address(state.marginCall));
        console.log("stockAmount", state.stockAmount);
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

        _eqAddr(nftOwner, state.signer, "ownerOf");
        _eq(recordedStock, state.stockAmount, "recorded stockAmount");
        _eq(principal, 0, "principal");
        _eq(accruedInterest, 0, "accruedInterest");
        _eqAddr(executor, address(0), "executor");
        _eq(currentDebt, 0, "currentDebt");
        _eq(custody, state.custodyBeforeOpen + recordedStock, "custody contains recorded stock");
        _eq(signerNvda, state.signerBalanceAfterMint - recordedStock, "signer debit on open");
    }

    function _inspectClose(RunState memory state) internal view {
        console.log("--- inspect after close ---");
        _assertTokenDoesNotExist(state.marginCall, state.tokenId);
        console.log("NFT no longer exists");

        (
            uint256 stockAfter,
            uint256 principalAfter,
            uint256 interestAfter,
            uint256 lastAccruedAfter,
            address executorAfter
        ) = state.marginCall.positions(state.tokenId);
        uint256 debtAfter = state.marginCall.currentDebt(state.tokenId);
        uint256 custodyAfterClose = state.nvdac.balanceOf(address(state.marginCall));
        uint256 signerAfterClose = state.nvdac.balanceOf(state.signer);

        console.log("deleted stockAmount", stockAfter);
        console.log("deleted principal", principalAfter);
        console.log("deleted accruedInterest", interestAfter);
        console.log("deleted lastAccruedAt", lastAccruedAfter);
        console.log("deleted executor", executorAfter);
        console.log("currentDebt", debtAfter);
        console.log("MarginCall NVDAc custody", custodyAfterClose);
        console.log("signer NVDAc balance", signerAfterClose);

        _eq(stockAfter, 0, "position.stockAmount deleted");
        _eq(principalAfter, 0, "position.principal deleted");
        _eq(interestAfter, 0, "position.accruedInterest deleted");
        _eq(lastAccruedAfter, 0, "position.lastAccruedAt deleted");
        _eqAddr(executorAfter, address(0), "position.executor deleted");
        _eq(debtAfter, 0, "currentDebt after close");
        _eq(state.custodyAfterOpen - custodyAfterClose, state.recordedStock, "custody decreased by recorded stock");
        _eq(signerAfterClose - state.signerBalanceAfterOpen, state.recordedStock, "signer received recorded NVDAc");
        _eq(custodyAfterClose, state.custodyBeforeOpen, "final custody");
        _eq(signerAfterClose, state.signerBalanceAfterMint, "final signer NVDAc");
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

    function _eq(uint256 actual, uint256 expected, string memory label) internal pure {
        if (actual != expected) {
            revert CheckFailed(label, expected, actual);
        }
    }

    function _eqAddr(address actual, address expected, string memory label) internal pure {
        if (actual != expected) {
            revert AddressCheckFailed(label, expected, actual);
        }
    }
}
