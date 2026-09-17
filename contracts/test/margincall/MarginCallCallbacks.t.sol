// SPDX-License-Identifier: MIT
pragma solidity 0.8.29;

import {Vm} from "forge-std/Vm.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {IERC721Errors} from "@openzeppelin/contracts/interfaces/draft-IERC6093.sol";

import {BaseV1Constants} from "../fixtures/BaseV1Constants.sol";
import {MarginCall} from "../../src/MarginCall.sol";
import {MarginCallTestBase} from "./MarginCallTestBase.sol";
import {
    CallbackCloser,
    CallbackTransferrer,
    InspectingReceiver,
    InvalidSelectorReceiver,
    NonReceiver,
    RevertingReceiver
} from "./PositionNftTestDoubles.sol";

/// @dev Safe-mint initialization, callback event order, and atomic rollback.
contract MarginCallCallbacksTest is MarginCallTestBase {
    function test_safeMintCallbackSeesInitializedPosition() public {
        InspectingReceiver receiver = new InspectingReceiver(marginCall, nvdac);
        uint256 deposit = 9 * ONE_NVDAC;
        nvdac.mint(address(receiver), deposit);

        uint256 tokenId = receiver.openSpot(deposit);

        assertEq(tokenId, 1);
        assertEq(receiver.observedOwner(), address(receiver));
        assertEq(receiver.observedStockAmount(), deposit);
        assertEq(receiver.observedPrincipal(), 0);
        assertEq(receiver.observedAccruedInterest(), 0);
        assertEq(receiver.observedLastAccruedAt(), BaseV1Constants.PINNED_TIMESTAMP);
        assertEq(receiver.observedExecutor(), address(0));
        assertEq(receiver.observedDebt(), 0);
        assertEq(receiver.observedCustody(), deposit);
        _assertLiveSpotPosition(tokenId, address(receiver), deposit, BaseV1Constants.PINNED_TIMESTAMP);
        assertEq(nvdac.balanceOf(address(marginCall)), deposit);
        assertEq(nvdac.balanceOf(address(receiver)), 0);
    }

    function test_positionOpenedEmittedBeforeCallbackClose() public {
        CallbackCloser closer = new CallbackCloser(marginCall, nvdac);
        uint256 deposit = 4 * ONE_NVDAC;
        nvdac.mint(address(closer), deposit);

        vm.recordLogs();
        uint256 tokenId = closer.openSpot(deposit);
        Vm.Log[] memory logs = vm.getRecordedLogs();

        assertEq(tokenId, 1);
        assertTrue(closer.didClose());
        _assertOpenedBeforeLaterLifecycle(logs, address(marginCall), address(closer));
        _assertTokenDoesNotExist(tokenId);
        _assertPositionDeleted(tokenId);
        assertEq(nvdac.balanceOf(address(closer)), deposit);
        assertEq(nvdac.balanceOf(address(marginCall)), 0);
    }

    function test_positionOpenedEmittedBeforeCallbackTransfer() public {
        CallbackTransferrer transferrer = new CallbackTransferrer(marginCall, nvdac, bob);
        uint256 deposit = 2 * ONE_NVDAC;
        nvdac.mint(address(transferrer), deposit);

        vm.recordLogs();
        uint256 tokenId = transferrer.openSpot(deposit);
        Vm.Log[] memory logs = vm.getRecordedLogs();

        assertEq(tokenId, 1);
        _assertOpenedBeforeLaterLifecycle(logs, address(marginCall), address(transferrer));
        assertEq(marginCall.ownerOf(tokenId), bob);
        _assertLiveSpotPosition(tokenId, bob, deposit, BaseV1Constants.PINNED_TIMESTAMP);
        assertEq(nvdac.balanceOf(address(marginCall)), deposit);

        vm.prank(address(transferrer));
        vm.expectRevert(abi.encodeWithSelector(MarginCall.NotPositionOwner.selector, address(transferrer), bob));
        marginCall.closePosition(tokenId);

        vm.prank(bob);
        marginCall.closePosition(tokenId);
        assertEq(nvdac.balanceOf(bob), deposit);
    }

    function test_revertingReceiverRollsBackAtomically() public {
        RevertingReceiver receiver = new RevertingReceiver(marginCall, nvdac);
        uint256 deposit = 6 * ONE_NVDAC;
        nvdac.mint(address(receiver), deposit);

        vm.expectRevert(RevertingReceiver.Rejected.selector);
        receiver.openSpot(deposit);

        _assertOpenFullyRolledBack(address(receiver), deposit);
        uint256 tokenId = _openAfterRollback(deposit);
        assertEq(tokenId, 1);
    }

    function test_invalidSelectorReceiverRollsBackAtomically() public {
        InvalidSelectorReceiver receiver = new InvalidSelectorReceiver(marginCall, nvdac);
        uint256 deposit = 3 * ONE_NVDAC;
        nvdac.mint(address(receiver), deposit);

        vm.expectRevert(abi.encodeWithSelector(IERC721Errors.ERC721InvalidReceiver.selector, address(receiver)));
        receiver.openSpot(deposit);

        _assertOpenFullyRolledBack(address(receiver), deposit);
        uint256 tokenId = _openAfterRollback(deposit);
        assertEq(tokenId, 1);
    }

    function test_nonReceiverRollsBackAtomically() public {
        NonReceiver receiver = new NonReceiver();
        uint256 deposit = ONE_NVDAC;
        nvdac.mint(address(receiver), deposit);

        vm.expectRevert(abi.encodeWithSelector(IERC721Errors.ERC721InvalidReceiver.selector, address(receiver)));
        receiver.openSpot(marginCall, nvdac, deposit);

        _assertOpenFullyRolledBack(address(receiver), deposit);
        uint256 tokenId = _openAfterRollback(deposit);
        assertEq(tokenId, 1);
    }

    function test_failedCallbackDoesNotAdvanceTokenIdsAfterSuccessfulOpen() public {
        _fund(alice, 2 * ONE_NVDAC);
        uint256 first = _open(alice, ONE_NVDAC);
        assertEq(first, 1);

        RevertingReceiver receiver = new RevertingReceiver(marginCall, nvdac);
        nvdac.mint(address(receiver), ONE_NVDAC);
        vm.expectRevert(RevertingReceiver.Rejected.selector);
        receiver.openSpot(ONE_NVDAC);

        uint256 second = _open(alice, ONE_NVDAC);
        assertEq(second, 2);
        _assertLiveSpotPosition(first, alice, ONE_NVDAC, BaseV1Constants.PINNED_TIMESTAMP);
        _assertLiveSpotPosition(second, alice, ONE_NVDAC, BaseV1Constants.PINNED_TIMESTAMP);
        assertEq(nvdac.balanceOf(address(receiver)), ONE_NVDAC);
    }

    function _openAfterRollback(uint256 deposit) private returns (uint256 tokenId) {
        _fund(alice, deposit);
        tokenId = _open(alice, deposit);
        _assertLiveSpotPosition(tokenId, alice, deposit, BaseV1Constants.PINNED_TIMESTAMP);
    }

    function _assertOpenFullyRolledBack(address opener, uint256 deposit) private {
        _assertTokenDoesNotExist(1);
        _assertPositionDeleted(1);
        assertEq(marginCall.balanceOf(opener), 0);
        assertEq(marginCall.balanceOf(alice), 0);
        assertEq(nvdac.balanceOf(address(marginCall)), 0);
        assertEq(nvdac.balanceOf(opener), deposit);
    }

    function _assertOpenedBeforeLaterLifecycle(Vm.Log[] memory logs, address mc, address opener) private pure {
        bytes32 openedTopic = MarginCall.PositionOpened.selector;
        bytes32 closedTopic = MarginCall.PositionClosed.selector;
        bytes32 transferTopic = IERC721.Transfer.selector;

        int256 openedIndex = -1;
        int256 mintIndex = -1;
        int256 laterTransferIndex = -1;
        int256 closedIndex = -1;

        for (uint256 i = 0; i < logs.length; ++i) {
            if (logs[i].emitter != mc || logs[i].topics.length == 0) {
                continue;
            }
            bytes32 topic0 = logs[i].topics[0];
            if (topic0 == openedTopic && openedIndex < 0) {
                openedIndex = int256(i);
                address openedOwner = address(uint160(uint256(logs[i].topics[2])));
                require(openedOwner == opener, "PositionOpened owner mismatch");
            } else if (topic0 == closedTopic && closedIndex < 0) {
                closedIndex = int256(i);
            } else if (topic0 == transferTopic) {
                address from = address(uint160(uint256(logs[i].topics[1])));
                if (from == address(0) && mintIndex < 0) {
                    mintIndex = int256(i);
                    address to = address(uint160(uint256(logs[i].topics[2])));
                    require(to == opener, "minted to unexpected owner");
                } else if (from != address(0) && laterTransferIndex < 0) {
                    laterTransferIndex = int256(i);
                }
            }
        }

        require(openedIndex >= 0, "missing PositionOpened");
        require(mintIndex > openedIndex, "mint Transfer before PositionOpened");
        if (closedIndex >= 0) {
            require(closedIndex > openedIndex, "PositionClosed before PositionOpened");
            require(closedIndex > mintIndex, "PositionClosed before mint Transfer");
        }
        if (laterTransferIndex >= 0) {
            require(laterTransferIndex > openedIndex, "transfer before PositionOpened");
            require(laterTransferIndex > mintIndex, "ownership transfer before mint Transfer");
        }
    }
}
