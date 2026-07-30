// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {Distributor} from "../src/Distributor.sol";
import {DistributorFixture} from "./helpers/DistributorFixture.sol";
import {MerkleTreeLib} from "./helpers/MerkleTreeLib.sol";
import {MockStockToken} from "./mocks/MockStockToken.sol";

contract DistributorClaimsTest is Test, DistributorFixture {
    // ========== Canonical leaf ==========

    function test_leafOfIsDoubleHashedAbiEncoding() public view {
        bytes32 expected =
            keccak256(bytes.concat(keccak256(abi.encode(uint256(7), maker, uint256(2e18), uint256(3e18)))));
        assertEq(distributor.leafOf(7, maker, 2e18, 3e18), expected);
    }

    function test_leafOfSeparatesEpochsAndAccounts() public view {
        bytes32 leaf = distributor.leafOf(1, maker, 1e18, 0);
        assertTrue(leaf != distributor.leafOf(2, maker, 1e18, 0));
        assertTrue(leaf != distributor.leafOf(1, maker2, 1e18, 0));
        assertTrue(leaf != distributor.leafOf(1, maker, 0, 1e18));
    }

    // ========== Happy path ==========

    function test_validProofPaysExactEntitlement() public {
        Entitlement[] memory list =
            _entitlements(Entitlement(maker, 10e18, 0), Entitlement(taker, 0, 5e18), Entitlement(maker2, 3e18, 1e18));
        (, uint256 total) = _postEpoch(0, list);
        Distributor.ClaimInput memory input = _claimInput(0, list, 2);

        vm.expectEmit(true, true, false, true, address(distributor));
        emit Distributor.Claimed(0, maker2, 3e18, 1e18, 4e18);
        uint256 paid = distributor.claim(maker2, input);

        assertEq(paid, 4e18);
        assertEq(token.balanceOf(maker2), 4e18);
        assertEq(distributor.fundedBalance(), FUNDED - 4e18);
        assertTrue(distributor.hasClaimed(0, maker2));
        assertEq(distributor.claimedTotalOf(0), 4e18);
        assertEq(distributor.claimCountOf(0), 1);
        assertEq(distributor.totalClaimed(), 4e18);
        assertEq(distributor.unclaimedOf(0), total - 4e18);
    }

    function test_everyClaimantInAnEpochCanClaim() public {
        Entitlement[] memory list =
            _entitlements(Entitlement(maker, 10e18, 0), Entitlement(taker, 0, 5e18), Entitlement(maker2, 3e18, 1e18));
        (, uint256 total) = _postEpoch(0, list);

        distributor.claim(maker, _claimInput(0, list, 0));
        distributor.claim(taker, _claimInput(0, list, 1));
        distributor.claim(maker2, _claimInput(0, list, 2));

        assertEq(token.balanceOf(maker), 10e18);
        assertEq(token.balanceOf(taker), 5e18);
        assertEq(token.balanceOf(maker2), 4e18);
        assertEq(distributor.claimedTotalOf(0), total);
        assertEq(distributor.unclaimedOf(0), 0);
        assertEq(distributor.fundedBalance(), FUNDED - total);
    }

    function test_anyoneMaySubmitButFundsGoToTheClaimant() public {
        Entitlement[] memory list = _entitlements(Entitlement(maker, 8e18, 2e18), Entitlement(taker, 0, 1e18));
        _postEpoch(0, list);
        Distributor.ClaimInput memory input = _claimInput(0, list, 0);

        vm.prank(stranger);
        distributor.claim(maker, input);

        assertEq(token.balanceOf(maker), 10e18);
        assertEq(token.balanceOf(stranger), 0);
    }

    function test_singleLeafEpochClaimsWithEmptyProof() public {
        Entitlement[] memory list = _entitlements(Entitlement(maker, 6e18, 0));
        _postEpoch(0, list);

        Distributor.ClaimInput memory input = _claimInput(0, list, 0);
        assertEq(input.proof.length, 0);

        distributor.claim(maker, input);
        assertEq(token.balanceOf(maker), 6e18);
    }

    // ========== Claims happen exactly once ==========

    function test_secondClaimOfSameEpochReverts() public {
        Entitlement[] memory list = _entitlements(Entitlement(maker, 10e18, 0), Entitlement(taker, 0, 5e18));
        _postEpoch(0, list);
        Distributor.ClaimInput memory input = _claimInput(0, list, 0);

        distributor.claim(maker, input);

        vm.expectRevert(abi.encodeWithSelector(Distributor.AlreadyClaimed.selector, 0, maker));
        distributor.claim(maker, input);

        assertEq(token.balanceOf(maker), 10e18);
    }

    function test_sameAccountClaimsEachEpochSeparately() public {
        Entitlement[] memory epoch0 = _entitlements(Entitlement(maker, 10e18, 0), Entitlement(taker, 0, 1e18));
        Entitlement[] memory epoch1 = _entitlements(Entitlement(maker, 7e18, 0), Entitlement(taker, 0, 2e18));

        _postEpoch(0, epoch0);
        _postEpoch(1, epoch1);

        distributor.claim(maker, _claimInput(0, epoch0, 0));
        distributor.claim(maker, _claimInput(1, epoch1, 0));

        assertEq(token.balanceOf(maker), 17e18);
        assertEq(distributor.totalClaimed(), 17e18);
    }

    function test_repeatedEpochInsideOneBatchReverts() public {
        Entitlement[] memory list = _entitlements(Entitlement(maker, 10e18, 0), Entitlement(taker, 0, 5e18));
        _postEpoch(0, list);

        Distributor.ClaimInput[] memory inputs = new Distributor.ClaimInput[](2);
        inputs[0] = _claimInput(0, list, 0);
        inputs[1] = _claimInput(0, list, 0);

        vm.expectRevert(abi.encodeWithSelector(Distributor.AlreadyClaimed.selector, 0, maker));
        distributor.claimBatch(maker, inputs);
    }

    // ========== Proof validation ==========

    function test_inflatedAmountFailsProof() public {
        Entitlement[] memory list = _entitlements(Entitlement(maker, 10e18, 0), Entitlement(taker, 0, 5e18));
        _postEpoch(0, list);

        Distributor.ClaimInput memory input = _claimInput(0, list, 0);
        input.makerAmount = 1_000e18;

        vm.expectRevert(abi.encodeWithSelector(Distributor.InvalidProof.selector, 0, maker));
        distributor.claim(maker, input);
    }

    function test_wrongAccountFailsProof() public {
        Entitlement[] memory list = _entitlements(Entitlement(maker, 10e18, 0), Entitlement(taker, 0, 5e18));
        _postEpoch(0, list);
        Distributor.ClaimInput memory input = _claimInput(0, list, 0);

        vm.expectRevert(abi.encodeWithSelector(Distributor.InvalidProof.selector, 0, stranger));
        distributor.claim(stranger, input);
    }

    function test_proofFromAnotherEpochFailsClosed() public {
        Entitlement[] memory epoch0 = _entitlements(Entitlement(maker, 10e18, 0), Entitlement(taker, 0, 5e18));
        Entitlement[] memory epoch1 = _entitlements(Entitlement(maker2, 4e18, 0), Entitlement(taker2, 0, 6e18));

        _postEpoch(0, epoch0);
        _postEpoch(1, epoch1);

        Distributor.ClaimInput memory input = _claimInput(0, epoch0, 0);
        input.epoch = 1;

        vm.expectRevert(abi.encodeWithSelector(Distributor.InvalidProof.selector, 1, maker));
        distributor.claim(maker, input);
    }

    function test_emptyProofAgainstMultiLeafRootFailsClosed() public {
        Entitlement[] memory list = _entitlements(Entitlement(maker, 10e18, 0), Entitlement(taker, 0, 5e18));
        _postEpoch(0, list);

        Distributor.ClaimInput memory input = _claimInput(0, list, 0);
        input.proof = new bytes32[](0);

        vm.expectRevert(abi.encodeWithSelector(Distributor.InvalidProof.selector, 0, maker));
        distributor.claim(maker, input);
    }

    function test_claimBeforeRootIsPostedReverts() public {
        Entitlement[] memory list = _entitlements(Entitlement(maker, 10e18, 0), Entitlement(taker, 0, 5e18));
        _endEpoch(0);
        Distributor.ClaimInput memory input = _claimInput(0, list, 0);

        vm.expectRevert(abi.encodeWithSelector(Distributor.ClaimRootNotPosted.selector, 0));
        distributor.claim(maker, input);
    }

    function test_zeroEntitlementReverts() public {
        Entitlement[] memory list = _entitlements(Entitlement(maker, 0, 0), Entitlement(taker, 0, 5e18));
        _endEpoch(0);
        bytes32 root = _rootOf(0, list);
        Distributor.ClaimInput memory input = _claimInput(0, list, 0);

        vm.prank(admin);
        distributor.postClaimRoot(0, root, 5e18);

        vm.expectRevert(Distributor.ZeroAmount.selector);
        distributor.claim(maker, input);
    }

    // ========== Batch claims ==========

    function test_claimBatchPaysEveryEpochInOneTransfer() public {
        Entitlement[] memory epoch0 = _entitlements(Entitlement(maker, 10e18, 0), Entitlement(taker, 0, 1e18));
        Entitlement[] memory epoch1 = _entitlements(Entitlement(maker, 7e18, 1e18), Entitlement(taker, 0, 2e18));
        Entitlement[] memory epoch2 = _entitlements(Entitlement(maker, 5e18, 0), Entitlement(taker, 0, 3e18));

        _postEpoch(0, epoch0);
        _postEpoch(1, epoch1);
        _postEpoch(2, epoch2);

        Distributor.ClaimInput[] memory inputs = new Distributor.ClaimInput[](3);
        inputs[0] = _claimInput(0, epoch0, 0);
        inputs[1] = _claimInput(1, epoch1, 0);
        inputs[2] = _claimInput(2, epoch2, 0);

        uint256 paid = distributor.claimBatch(maker, inputs);

        assertEq(paid, 23e18);
        assertEq(token.balanceOf(maker), 23e18);
        assertEq(distributor.totalClaimed(), 23e18);
        assertTrue(distributor.hasClaimed(0, maker));
        assertTrue(distributor.hasClaimed(1, maker));
        assertTrue(distributor.hasClaimed(2, maker));
    }

    function test_claimBatchRejectsEmptyInput() public {
        Distributor.ClaimInput[] memory inputs = new Distributor.ClaimInput[](0);

        vm.expectRevert(Distributor.EmptyClaimBatch.selector);
        distributor.claimBatch(maker, inputs);
    }

    function test_claimBatchIsAllOrNothing() public {
        Entitlement[] memory epoch0 = _entitlements(Entitlement(maker, 10e18, 0), Entitlement(taker, 0, 1e18));
        Entitlement[] memory epoch1 = _entitlements(Entitlement(maker, 7e18, 0), Entitlement(taker, 0, 2e18));
        _postEpoch(0, epoch0);
        _postEpoch(1, epoch1);

        Distributor.ClaimInput[] memory inputs = new Distributor.ClaimInput[](2);
        inputs[0] = _claimInput(0, epoch0, 0);
        inputs[1] = _claimInput(1, epoch1, 0);
        inputs[1].makerAmount = 100e18; // tampered

        vm.expectRevert(abi.encodeWithSelector(Distributor.InvalidProof.selector, 1, maker));
        distributor.claimBatch(maker, inputs);

        assertEq(token.balanceOf(maker), 0);
        assertFalse(distributor.hasClaimed(0, maker));
    }

    // ========== A bad root cannot overdraw ==========

    function test_epochPayoutsCappedByDeclaredTotal() public {
        Entitlement[] memory list = _entitlements(Entitlement(maker, 100e18, 0), Entitlement(taker, 0, 100e18));
        _endEpoch(0);
        bytes32 root = _rootOf(0, list);
        Distributor.ClaimInput memory first = _claimInput(0, list, 0);
        Distributor.ClaimInput memory second = _claimInput(0, list, 1);

        // Root commits to 200e18 but the epoch is declared as 150e18.
        vm.prank(admin);
        distributor.postClaimRoot(0, root, 150e18);

        distributor.claim(maker, first);
        assertEq(distributor.claimedTotalOf(0), 100e18);

        vm.expectRevert(abi.encodeWithSelector(Distributor.EpochTotalExceeded.selector, 0, 200e18, 150e18));
        distributor.claim(taker, second);

        assertEq(token.balanceOf(taker), 0);
    }

    function test_heldBalanceIsTheHardCap() public {
        uint256 oversized = FUNDED + 1e18;
        Entitlement[] memory list = _entitlements(Entitlement(maker, oversized, 0), Entitlement(taker, 0, 1e18));
        _postEpoch(0, list);
        Distributor.ClaimInput memory input = _claimInput(0, list, 0);

        vm.expectRevert(abi.encodeWithSelector(Distributor.InsufficientFunds.selector, oversized, FUNDED));
        distributor.claim(maker, input);

        assertEq(distributor.fundedBalance(), FUNDED);
        assertEq(distributor.totalClaimed(), 0);
    }

    function test_balanceCapBindsEvenAfterPartialClaims() public {
        uint256 half = (FUNDED * 2) / 3;
        Entitlement[] memory list = _entitlements(Entitlement(maker, half, 0), Entitlement(maker2, half, 0));
        _postEpoch(0, list);
        Distributor.ClaimInput memory first = _claimInput(0, list, 0);
        Distributor.ClaimInput memory second = _claimInput(0, list, 1);

        distributor.claim(maker, first);
        assertEq(token.balanceOf(maker), half);

        vm.expectRevert(abi.encodeWithSelector(Distributor.InsufficientFunds.selector, half, FUNDED - half));
        distributor.claim(maker2, second);
    }

    function test_toppingUpUnblocksAnUnderfundedClaim() public {
        uint256 oversized = FUNDED + 10e18;
        Entitlement[] memory list = _entitlements(Entitlement(maker, oversized, 0), Entitlement(taker, 0, 1e18));
        _postEpoch(0, list);
        Distributor.ClaimInput memory input = _claimInput(0, list, 0);

        vm.expectRevert(abi.encodeWithSelector(Distributor.InsufficientFunds.selector, oversized, FUNDED));
        distributor.claim(maker, input);

        _fund(10e18);
        distributor.claim(maker, input);

        assertEq(token.balanceOf(maker), oversized);
        assertEq(distributor.fundedBalance(), 0);
    }

    function test_replacedRootInvalidatesTheOldProof() public {
        Entitlement[] memory wrong = _entitlements(Entitlement(maker, 999e18, 0), Entitlement(taker, 0, 1e18));
        Entitlement[] memory right = _entitlements(Entitlement(maker, 9e18, 0), Entitlement(taker, 0, 1e18));
        _postEpoch(0, wrong);

        bytes32 rightRoot = _rootOf(0, right);
        uint256 rightTotal = _totalOf(right);
        Distributor.ClaimInput memory staleInput = _claimInput(0, wrong, 0);
        Distributor.ClaimInput memory freshInput = _claimInput(0, right, 0);

        vm.prank(admin);
        distributor.postClaimRoot(0, rightRoot, rightTotal);

        vm.expectRevert(abi.encodeWithSelector(Distributor.InvalidProof.selector, 0, maker));
        distributor.claim(maker, staleInput);

        distributor.claim(maker, freshInput);
        assertEq(token.balanceOf(maker), 9e18);
    }

    // ========== Recomputing a root from the same records ==========

    function test_rootIsReproducibleFromTheSameEntitlements() public {
        Entitlement[] memory list =
            _entitlements(Entitlement(maker, 10e18, 0), Entitlement(taker, 0, 5e18), Entitlement(maker2, 3e18, 1e18));
        (bytes32 posted,) = _postEpoch(0, list);

        // Independently rebuild the tree from the leaves the contract itself hashes.
        bytes32[] memory leaves = new bytes32[](3);
        leaves[0] = distributor.leafOf(0, maker, 10e18, 0);
        leaves[1] = distributor.leafOf(0, taker, 0, 5e18);
        leaves[2] = distributor.leafOf(0, maker2, 3e18, 1e18);

        assertEq(MerkleTreeLib.rootOf(leaves), posted);
        assertEq(distributor.claimRootOf(0), posted);
    }

    function test_leafOrderDoesNotChangeTheRoot() public view {
        Entitlement[] memory forward =
            _entitlements(Entitlement(maker, 10e18, 0), Entitlement(taker, 0, 5e18), Entitlement(maker2, 3e18, 1e18));
        Entitlement[] memory reversed =
            _entitlements(Entitlement(maker2, 3e18, 1e18), Entitlement(taker, 0, 5e18), Entitlement(maker, 10e18, 0));

        assertEq(_rootOf(0, forward), _rootOf(0, reversed));
    }

    // ========== Sweep ==========

    function test_sweepCannotTouchTheGameToken() public {
        vm.expectRevert(Distributor.CannotSweepGameToken.selector);
        vm.prank(admin);
        distributor.sweep(address(token), admin, 1e18);

        assertEq(distributor.fundedBalance(), FUNDED);
    }

    function test_sweepRecoversStrayTokens() public {
        MockStockToken stray = new MockStockToken("Stray Test Stock", "tSTRAY", 18);
        stray.mint(address(distributor), 5e18);

        vm.expectEmit(true, true, false, true, address(distributor));
        emit Distributor.Swept(address(stray), admin, 5e18);
        vm.prank(admin);
        distributor.sweep(address(stray), admin, 5e18);

        assertEq(stray.balanceOf(admin), 5e18);
    }

    function test_sweepGuardsAndAccessControl() public {
        MockStockToken stray = new MockStockToken("Stray Test Stock", "tSTRAY", 18);
        stray.mint(address(distributor), 5e18);

        vm.expectRevert(Distributor.ZeroAddress.selector);
        vm.prank(admin);
        distributor.sweep(address(stray), address(0), 1e18);

        vm.expectRevert(Distributor.ZeroAmount.selector);
        vm.prank(admin);
        distributor.sweep(address(stray), admin, 0);

        vm.expectRevert();
        vm.prank(stranger);
        distributor.sweep(address(stray), stranger, 1e18);
    }
}
