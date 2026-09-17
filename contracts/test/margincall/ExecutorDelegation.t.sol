// SPDX-License-Identifier: MIT
pragma solidity 0.8.29;

import {IERC721Errors} from "@openzeppelin/contracts/interfaces/draft-IERC6093.sol";

import {MarginCall} from "../../src/MarginCall.sol";
import {MarginCallTestBase} from "./MarginCallTestBase.sol";

/// @dev Owner-only executor appointment and the permission boundary versus ERC-721 transfer authority.
contract ExecutorDelegationTest is MarginCallTestBase {
    function test_ownerCanSetReplaceAndClearExecutor() public {
        _fund(alice, ONE_NVDAC);
        uint256 tokenId = _openFinanced(alice, ONE_NVDAC, LEVERAGE_1_25X, 0);

        vm.expectEmit(true, true, true, true, address(marginCall));
        emit MarginCall.ExecutorUpdated(tokenId, address(0), bob);
        vm.prank(alice);
        marginCall.setExecutor(tokenId, bob);
        (,,,, address executor) = _position(tokenId);
        assertEq(executor, bob);

        vm.expectEmit(true, true, true, true, address(marginCall));
        emit MarginCall.ExecutorUpdated(tokenId, bob, carol);
        vm.prank(alice);
        marginCall.setExecutor(tokenId, carol);
        (,,,, executor) = _position(tokenId);
        assertEq(executor, carol);

        vm.expectEmit(true, true, true, true, address(marginCall));
        emit MarginCall.ExecutorUpdated(tokenId, carol, address(0));
        vm.prank(alice);
        marginCall.setExecutor(tokenId, address(0));
        (,,,, executor) = _position(tokenId);
        assertEq(executor, address(0));
    }

    function test_nonOwnerApprovedAndExecutorCannotSetExecutor() public {
        _fund(alice, ONE_NVDAC);
        uint256 tokenId = _openFinanced(alice, ONE_NVDAC, LEVERAGE_1_25X, 0);

        vm.prank(alice);
        marginCall.setExecutor(tokenId, bob);
        vm.prank(alice);
        marginCall.approve(carol, tokenId);

        vm.expectRevert(abi.encodeWithSelector(MarginCall.NotPositionOwner.selector, carol, alice));
        vm.prank(carol);
        marginCall.setExecutor(tokenId, carol);

        vm.expectRevert(abi.encodeWithSelector(MarginCall.NotPositionOwner.selector, bob, alice));
        vm.prank(bob);
        marginCall.setExecutor(tokenId, carol);

        address outsider = makeAddr("outsider");
        vm.expectRevert(abi.encodeWithSelector(MarginCall.NotPositionOwner.selector, outsider, alice));
        vm.prank(outsider);
        marginCall.setExecutor(tokenId, outsider);

        (,,,, address executor) = _position(tokenId);
        assertEq(executor, bob);
    }

    function test_executorCanRepayAndReduceButCannotTransferCloseOrSetExecutor() public {
        (uint256 tokenId, uint256 debt) = _openFinancedWithAccrual();
        (uint256 stockBefore,,,,) = _position(tokenId);

        vm.prank(alice);
        marginCall.setExecutor(tokenId, bob);

        uint256 half = debt / 2;
        _fundUsdc(bob, half);
        vm.prank(bob);
        marginCall.repay(tokenId, half);
        assertEq(marginCall.currentDebt(tokenId), debt - half);

        uint256 sale = ONE_NVDAC / 20;
        vm.prank(bob);
        marginCall.reduceExposure(tokenId, sale, 0);
        (uint256 stockAfter,,,,) = _position(tokenId);
        assertEq(stockAfter, stockBefore - sale);

        vm.expectRevert(abi.encodeWithSelector(IERC721Errors.ERC721InsufficientApproval.selector, bob, tokenId));
        vm.prank(bob);
        marginCall.transferFrom(alice, carol, tokenId);

        vm.expectRevert(abi.encodeWithSelector(IERC721Errors.ERC721InsufficientApproval.selector, bob, tokenId));
        vm.prank(bob);
        marginCall.safeTransferFrom(alice, carol, tokenId);

        vm.expectRevert(abi.encodeWithSelector(MarginCall.NotPositionOwner.selector, bob, alice));
        vm.prank(bob);
        marginCall.closePosition(tokenId);

        vm.expectRevert(abi.encodeWithSelector(MarginCall.NotPositionOwner.selector, bob, alice));
        vm.prank(bob);
        marginCall.setExecutor(tokenId, carol);

        assertEq(marginCall.ownerOf(tokenId), alice);
        (,,,, address executor) = _position(tokenId);
        assertEq(executor, bob);
    }

    function test_erc721ApprovalCannotRepayOrSetExecutorButCanTransfer() public {
        (uint256 tokenId, uint256 debt) = _openFinancedWithAccrual();

        vm.prank(alice);
        marginCall.approve(bob, tokenId);

        _assertTransferAuthorityCannotManage(tokenId, debt);
    }

    function test_operatorCannotRepayOrSetExecutorButCanTransfer() public {
        (uint256 tokenId, uint256 debt) = _openFinancedWithAccrual();

        vm.prank(alice);
        marginCall.setApprovalForAll(bob, true);

        _assertTransferAuthorityCannotManage(tokenId, debt);
    }

    function test_clearingExecutorRevokesRepayAndReduceImmediately() public {
        (uint256 tokenId, uint256 debt) = _openFinancedWithAccrual();

        vm.prank(alice);
        marginCall.setExecutor(tokenId, bob);

        vm.prank(alice);
        marginCall.setExecutor(tokenId, address(0));

        _fundUsdc(bob, debt);
        vm.expectRevert(abi.encodeWithSelector(MarginCall.NotPositionManager.selector, bob, alice, address(0)));
        vm.prank(bob);
        marginCall.repay(tokenId, debt);

        vm.expectRevert(abi.encodeWithSelector(MarginCall.NotPositionManager.selector, bob, alice, address(0)));
        vm.prank(bob);
        marginCall.reduceExposure(tokenId, ONE_NVDAC / 20, 0);
    }

    function test_executorOpenPositionMintsSeparateTokenNotPrincipalOnExisting() public {
        _fund(alice, ONE_NVDAC);
        uint256 tokenId = _openFinanced(alice, ONE_NVDAC, LEVERAGE_1_25X, 0);
        (uint256 stockBefore, uint256 principalBefore,,,) = _position(tokenId);

        vm.prank(alice);
        marginCall.setExecutor(tokenId, bob);

        _fund(bob, ONE_NVDAC);
        uint256 bobToken = _openFinanced(bob, ONE_NVDAC, LEVERAGE_1_1X, 0);
        assertEq(bobToken, 2);
        assertEq(marginCall.ownerOf(bobToken), bob);

        (uint256 stockAfter, uint256 principalAfter,,,) = _position(tokenId);
        assertEq(stockAfter, stockBefore);
        assertEq(principalAfter, principalBefore);
        assertEq(marginCall.ownerOf(tokenId), alice);
    }

    function test_setExecutorRevertsForNonexistentToken() public {
        vm.expectRevert(abi.encodeWithSelector(IERC721Errors.ERC721NonexistentToken.selector, 1));
        vm.prank(alice);
        marginCall.setExecutor(1, bob);
    }

    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------

    /// @dev Open a financed position for alice and let 5 days of interest accrue.
    function _openFinancedWithAccrual() internal returns (uint256 tokenId, uint256 debt) {
        _fund(alice, ONE_NVDAC);
        tokenId = _openFinanced(alice, ONE_NVDAC, LEVERAGE_1_25X, 0);
        vm.warp(OPENED_AT + 5 days);
        debt = marginCall.currentDebt(tokenId);
    }

    /// @dev ERC-721 transfer authority (single approval or operator) may move the token but never manage
    ///      the position. Caller grants bob the authority under test first.
    function _assertTransferAuthorityCannotManage(uint256 tokenId, uint256 debt) internal {
        _fundUsdc(bob, debt);
        vm.expectRevert(abi.encodeWithSelector(MarginCall.NotPositionManager.selector, bob, alice, address(0)));
        vm.prank(bob);
        marginCall.repay(tokenId, debt);

        vm.expectRevert(abi.encodeWithSelector(MarginCall.NotPositionManager.selector, bob, alice, address(0)));
        vm.prank(bob);
        marginCall.reduceExposure(tokenId, ONE_NVDAC / 20, 0);

        vm.expectRevert(abi.encodeWithSelector(MarginCall.NotPositionOwner.selector, bob, alice));
        vm.prank(bob);
        marginCall.setExecutor(tokenId, bob);

        vm.prank(bob);
        marginCall.transferFrom(alice, carol, tokenId);
        assertEq(marginCall.ownerOf(tokenId), carol);
        (,,,, address executor) = _position(tokenId);
        assertEq(executor, address(0));
    }
}
