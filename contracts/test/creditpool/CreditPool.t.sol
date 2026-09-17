// SPDX-License-Identifier: MIT
pragma solidity 0.8.29;

import {CreditPool} from "../../src/CreditPool.sol";
import {MarginCall} from "../../src/MarginCall.sol";
import {MarginCallTestBase} from "../margincall/MarginCallTestBase.sol";

/// @dev RPC-free treasury withdrawal on the protocol-owned CreditPool.
contract CreditPoolTest is MarginCallTestBase {
    function test_constructorStoresNonzeroTreasury() public view {
        assertEq(pool.treasury(), treasury);
        assertTrue(pool.treasury() != address(0));
    }

    function test_constructorRevertsOnZeroAddresses() public {
        vm.expectRevert(CreditPool.ZeroAddress.selector);
        new CreditPool(address(0), address(marginCall), treasury);

        vm.expectRevert(CreditPool.ZeroAddress.selector);
        new CreditPool(address(usdc), address(0), treasury);

        vm.expectRevert(CreditPool.ZeroAddress.selector);
        new CreditPool(address(usdc), address(marginCall), address(0));
    }

    function test_nonTreasuryCannotWithdraw() public {
        vm.expectRevert(abi.encodeWithSelector(CreditPool.UnauthorizedTreasury.selector, address(this)));
        pool.withdraw(1);

        vm.expectRevert(abi.encodeWithSelector(CreditPool.UnauthorizedTreasury.selector, alice));
        vm.prank(alice);
        pool.withdraw(1);
    }

    function test_partialWithdrawReducesAvailableCredit() public {
        uint256 amount = 100_000e6;
        uint256 poolBefore = pool.availableCredit();
        uint256 treasuryBefore = usdc.balanceOf(treasury);

        vm.expectEmit(false, false, false, true, address(pool));
        emit CreditPool.TreasuryWithdrawn(amount);
        vm.prank(treasury);
        pool.withdraw(amount);

        assertEq(pool.availableCredit(), poolBefore - amount);
        assertEq(usdc.balanceOf(treasury), treasuryBefore + amount);
    }

    function test_fullWithdrawDrainsIdleCredit() public {
        uint256 available = pool.availableCredit();
        assertGt(available, 0);

        vm.expectEmit(false, false, false, true, address(pool));
        emit CreditPool.TreasuryWithdrawn(available);
        vm.prank(treasury);
        pool.withdraw(available);

        assertEq(pool.availableCredit(), 0);
        assertEq(usdc.balanceOf(treasury), available);
    }

    function test_overWithdrawRevertsAtomically() public {
        uint256 available = pool.availableCredit();
        uint256 treasuryBefore = usdc.balanceOf(treasury);

        vm.expectRevert(abi.encodeWithSelector(CreditPool.InsufficientCredit.selector, available + 1, available));
        vm.prank(treasury);
        pool.withdraw(available + 1);

        assertEq(pool.availableCredit(), available);
        assertEq(usdc.balanceOf(treasury), treasuryBefore);
    }

    function test_drainedPoolBlocksFinancedOpenButNotSpot() public {
        uint256 available = pool.availableCredit();
        vm.prank(treasury);
        pool.withdraw(available);
        assertEq(pool.availableCredit(), 0);

        uint256 needed = _expectedPrincipal(ONE_NVDAC, LEVERAGE_1_25X);
        _fund(alice, ONE_NVDAC);
        vm.expectRevert(abi.encodeWithSelector(CreditPool.InsufficientCredit.selector, needed, 0));
        _openFinanced(alice, ONE_NVDAC, LEVERAGE_1_25X, 0);

        uint256 tokenId = _open(alice, ONE_NVDAC);
        _assertLiveSpotPosition(tokenId, alice, ONE_NVDAC, OPENED_AT);
        assertEq(marginCall.currentDebt(tokenId), 0);
    }

    function test_repayRestoresIdleCreditThatTreasuryCanWithdraw() public {
        _fund(alice, ONE_NVDAC);
        uint256 tokenId = _openFinanced(alice, ONE_NVDAC, LEVERAGE_1_25X, 0);
        (, uint256 principal,,,) = _position(tokenId);
        assertGt(principal, 0);

        uint256 idleAfterOpen = pool.availableCredit();
        vm.prank(treasury);
        pool.withdraw(idleAfterOpen);
        assertEq(pool.availableCredit(), 0);

        _fundUsdc(alice, principal);
        vm.prank(alice);
        marginCall.repay(tokenId, principal);
        assertEq(marginCall.currentDebt(tokenId), 0);
        assertEq(pool.availableCredit(), principal);

        uint256 treasuryBefore = usdc.balanceOf(treasury);
        vm.expectEmit(false, false, false, true, address(pool));
        emit CreditPool.TreasuryWithdrawn(principal);
        vm.prank(treasury);
        pool.withdraw(principal);

        assertEq(pool.availableCredit(), 0);
        assertEq(usdc.balanceOf(treasury), treasuryBefore + principal);
    }

    function test_withdrawDoesNotTouchOutstandingDebtOrCustody() public {
        _fund(alice, ONE_NVDAC);
        uint256 tokenId = _openFinanced(alice, ONE_NVDAC, LEVERAGE_1_25X, 0);
        (uint256 stock, uint256 principal,,,) = _position(tokenId);
        uint256 debt = marginCall.currentDebt(tokenId);
        uint256 custody = nvdac.balanceOf(address(marginCall));

        uint256 idle = pool.availableCredit();
        vm.prank(treasury);
        pool.withdraw(idle);

        assertEq(marginCall.ownerOf(tokenId), alice);
        (uint256 stockAfter, uint256 principalAfter,,,) = _position(tokenId);
        assertEq(stockAfter, stock);
        assertEq(principalAfter, principal);
        assertEq(marginCall.currentDebt(tokenId), debt);
        assertEq(nvdac.balanceOf(address(marginCall)), custody);
        assertEq(pool.availableCredit(), 0);
    }
}
