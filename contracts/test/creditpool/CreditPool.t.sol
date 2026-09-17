// SPDX-License-Identifier: MIT
pragma solidity 0.8.29;

import {CreditPool} from "../../src/CreditPool.sol";
import {MarginCallTestBase} from "../margincall/MarginCallTestBase.sol";

/// @dev RPC-free treasury withdrawal on the protocol-owned CreditPool.
contract CreditPoolTest is MarginCallTestBase {
    function test_constructorStoresTreasury() public view {
        assertEq(pool.treasury(), treasury);
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

    /// @dev Walks partial then remainder, so this also pins that two withdrawals accumulate at the treasury.
    function test_withdrawMovesIdleCreditToTreasury() public {
        uint256 available = pool.availableCredit();
        assertGt(available, 0);
        uint256 half = available / 2;

        vm.expectEmit(address(pool));
        emit CreditPool.TreasuryWithdrawn(half);
        vm.prank(treasury);
        pool.withdraw(half);

        assertEq(pool.availableCredit(), available - half);
        assertEq(usdc.balanceOf(treasury), half);

        vm.prank(treasury);
        pool.withdraw(available - half);

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

    /// @dev The spot half of this pairing is already owned by `FinancedOpen.test_spotOpenWorksWithEmptyPool`:
    ///      once credit is zero the spot path cannot see which function drained it.
    function test_drainedPoolBlocksFinancedOpen() public {
        // Read before the prank: `vm.prank` covers only the next call, and a getter would consume it.
        uint256 available = pool.availableCredit();
        vm.prank(treasury);
        pool.withdraw(available);
        assertEq(pool.availableCredit(), 0);

        uint256 needed = _expectedPrincipal(ONE_NVDAC, LEVERAGE_1_25X);
        _fund(alice, ONE_NVDAC);
        vm.expectRevert(abi.encodeWithSelector(CreditPool.InsufficientCredit.selector, needed, 0));
        _openFinanced(alice, ONE_NVDAC, LEVERAGE_1_25X, 0);
    }

    /// @dev `withdraw` reads the balance at call time, so credit returned by a repay is withdrawable too.
    function test_repayRestoresIdleCreditThatTreasuryCanWithdraw() public {
        (uint256 tokenId,, uint256 debt) = _openFinancedFixture();

        uint256 idleAfterOpen = pool.availableCredit();
        vm.prank(treasury);
        pool.withdraw(idleAfterOpen);
        assertEq(pool.availableCredit(), 0);

        _fundUsdc(alice, debt);
        vm.prank(alice);
        marginCall.repay(tokenId, debt);
        assertEq(pool.availableCredit(), debt);

        uint256 treasuryBefore = usdc.balanceOf(treasury);
        vm.expectEmit(address(pool));
        emit CreditPool.TreasuryWithdrawn(debt);
        vm.prank(treasury);
        pool.withdraw(debt);

        assertEq(pool.availableCredit(), 0);
        assertEq(usdc.balanceOf(treasury), treasuryBefore + debt);
    }

    function test_withdrawDoesNotTouchOutstandingDebtOrCustody() public {
        (uint256 tokenId,,) = _openFinancedFixture();
        Snapshot memory expected = _snapshot(tokenId);
        // Idle credit is the only leg a treasury withdrawal may move.
        expected.poolCredit = 0;

        uint256 idle = pool.availableCredit();
        vm.prank(treasury);
        pool.withdraw(idle);

        assertEq(marginCall.ownerOf(tokenId), alice);
        _assertSnapshot(tokenId, expected);
    }
}
