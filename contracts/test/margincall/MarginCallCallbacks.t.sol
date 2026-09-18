// SPDX-License-Identifier: MIT
pragma solidity 0.8.29;

import {Vm} from "forge-std/Vm.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {IERC721Errors} from "@openzeppelin/contracts/interfaces/draft-IERC6093.sol";

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
        InspectingReceiver receiver = new InspectingReceiver(marginCall, nvdac, defaultAssetId);
        uint256 deposit = 9 * ONE_NVDAC;
        nvdac.mint(address(receiver), deposit);

        uint256 tokenId = receiver.openSpot(deposit);

        assertEq(tokenId, 1);
        assertEq(receiver.observedOwner(), address(receiver));
        assertEq(receiver.observedAssetId(), defaultAssetId);
        assertEq(receiver.observedStockAmount(), deposit);
        assertEq(receiver.observedPrincipal(), 0);
        assertEq(receiver.observedAccruedInterest(), 0);
        assertEq(receiver.observedLastAccruedAt(), OPENED_AT);
        assertEq(receiver.observedExecutor(), address(0));
        assertEq(receiver.observedDebt(), 0);
        assertEq(receiver.observedCustody(), deposit);
        _assertLiveSpotPosition(tokenId, address(receiver), deposit, OPENED_AT);
        assertEq(nvdac.balanceOf(address(marginCall)), deposit);
        assertEq(nvdac.balanceOf(address(receiver)), 0);
    }

    function test_positionOpenedEmittedBeforeCallbackClose() public {
        CallbackCloser closer = new CallbackCloser(marginCall, nvdac, defaultAssetId);
        uint256 deposit = 4 * ONE_NVDAC;
        nvdac.mint(address(closer), deposit);

        vm.recordLogs();
        uint256 tokenId = closer.openSpot(deposit);
        Vm.Log[] memory logs = vm.getRecordedLogs();

        assertEq(tokenId, 1);
        assertTrue(closer.didClose());
        _assertMarginCallEvents(logs, address(closer), _openThenTransferOrder(true));
        _assertTokenDoesNotExist(tokenId);
        _assertPositionDeleted(tokenId);
        assertEq(nvdac.balanceOf(address(closer)), deposit);
        assertEq(nvdac.balanceOf(address(marginCall)), 0);
    }

    function test_positionOpenedEmittedBeforeCallbackTransfer() public {
        CallbackTransferrer transferrer = new CallbackTransferrer(marginCall, nvdac, defaultAssetId, bob);
        uint256 deposit = 2 * ONE_NVDAC;
        nvdac.mint(address(transferrer), deposit);

        vm.recordLogs();
        uint256 tokenId = transferrer.openSpot(deposit);
        Vm.Log[] memory logs = vm.getRecordedLogs();

        assertEq(tokenId, 1);
        _assertMarginCallEvents(logs, address(transferrer), _openThenTransferOrder(false));
        assertEq(marginCall.ownerOf(tokenId), bob);
        _assertLiveSpotPosition(tokenId, bob, deposit, OPENED_AT);
        assertEq(nvdac.balanceOf(address(marginCall)), deposit);

        vm.prank(address(transferrer));
        vm.expectRevert(abi.encodeWithSelector(MarginCall.NotPositionOwner.selector, address(transferrer), bob));
        marginCall.closePosition(tokenId);

        vm.prank(bob);
        marginCall.closePosition(tokenId);
        assertEq(nvdac.balanceOf(bob), deposit);
    }

    function test_revertingReceiverRollsBackAtomically() public {
        RevertingReceiver receiver = new RevertingReceiver(marginCall, nvdac, defaultAssetId);
        uint256 deposit = 6 * ONE_NVDAC;
        nvdac.mint(address(receiver), deposit);

        vm.expectRevert(RevertingReceiver.Rejected.selector);
        receiver.openSpot(deposit);

        _assertOpenFullyRolledBack(address(receiver), deposit);
        uint256 tokenId = _openAfterRollback(deposit);
        assertEq(tokenId, 1);
    }

    function test_invalidSelectorReceiverRollsBackAtomically() public {
        InvalidSelectorReceiver receiver = new InvalidSelectorReceiver(marginCall, nvdac, defaultAssetId);
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
        receiver.openSpot(marginCall, nvdac, defaultAssetId, deposit);

        _assertOpenFullyRolledBack(address(receiver), deposit);
        uint256 tokenId = _openAfterRollback(deposit);
        assertEq(tokenId, 1);
    }

    function test_failedCallbackDoesNotAdvanceTokenIdsAfterSuccessfulOpen() public {
        _fund(alice, 2 * ONE_NVDAC);
        uint256 first = _open(alice, ONE_NVDAC);
        assertEq(first, 1);

        RevertingReceiver receiver = new RevertingReceiver(marginCall, nvdac, defaultAssetId);
        nvdac.mint(address(receiver), ONE_NVDAC);
        vm.expectRevert(RevertingReceiver.Rejected.selector);
        receiver.openSpot(ONE_NVDAC);

        uint256 second = _open(alice, ONE_NVDAC);
        assertEq(second, 2);
        _assertLiveSpotPosition(first, alice, ONE_NVDAC, OPENED_AT);
        _assertLiveSpotPosition(second, alice, ONE_NVDAC, OPENED_AT);
        assertEq(nvdac.balanceOf(address(receiver)), ONE_NVDAC);
    }

    function _openAfterRollback(uint256 deposit) private returns (uint256 tokenId) {
        _fund(alice, deposit);
        tokenId = _open(alice, deposit);
        _assertLiveSpotPosition(tokenId, alice, deposit, OPENED_AT);
    }

    function _assertOpenFullyRolledBack(address opener, uint256 deposit) private {
        _assertTokenDoesNotExist(1);
        _assertPositionDeleted(1);
        assertEq(marginCall.balanceOf(opener), 0);
        assertEq(marginCall.balanceOf(alice), 0);
        assertEq(nvdac.balanceOf(address(marginCall)), 0);
        assertEq(nvdac.balanceOf(opener), deposit);
    }

    /// @dev Asserts the exact topic0 sequence `marginCall` emitted, plus the opener facts carried in the first
    ///      two events. Sequence-based rather than index-comparison-based so every check is unconditional: the
    ///      previous form skipped its close/transfer ordering asserts when the event was absent entirely.
    function _assertMarginCallEvents(Vm.Log[] memory logs, address opener, bytes32[] memory expectedOrder)
        private
        view
    {
        Vm.Log[] memory emitted = _marginCallLogs(logs);
        assertEq(emitted.length, expectedOrder.length, "unexpected MarginCall event count");
        for (uint256 i = 0; i < expectedOrder.length; ++i) {
            assertEq(emitted[i].topics[0], expectedOrder[i], "unexpected MarginCall event order");
        }

        // PositionOpened(tokenId, owner, assetId, stockAmount) then the mint Transfer(address(0), opener, tokenId).
        assertEq(_topicAddress(emitted[0].topics[2]), opener, "PositionOpened owner");
        assertEq(_topicAddress(emitted[1].topics[1]), address(0), "mint Transfer from");
        assertEq(_topicAddress(emitted[1].topics[2]), opener, "mint Transfer to");
    }

    function _marginCallLogs(Vm.Log[] memory logs) private view returns (Vm.Log[] memory emitted) {
        uint256 count;
        for (uint256 i = 0; i < logs.length; ++i) {
            if (logs[i].emitter == address(marginCall) && logs[i].topics.length != 0) {
                ++count;
            }
        }
        emitted = new Vm.Log[](count);
        uint256 next;
        for (uint256 i = 0; i < logs.length; ++i) {
            if (logs[i].emitter == address(marginCall) && logs[i].topics.length != 0) {
                emitted[next++] = logs[i];
            }
        }
    }

    function _topicAddress(bytes32 topic) private pure returns (address) {
        return address(uint160(uint256(topic)));
    }

    function _openThenTransferOrder(bool closed) private pure returns (bytes32[] memory order) {
        order = new bytes32[](closed ? 4 : 3);
        order[0] = MarginCall.PositionOpened.selector;
        order[1] = IERC721.Transfer.selector;
        order[2] = IERC721.Transfer.selector;
        if (closed) {
            order[3] = MarginCall.PositionClosed.selector;
        }
    }
}
