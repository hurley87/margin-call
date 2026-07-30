// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {Distributor} from "../src/Distributor.sol";
import {DistributorFixture} from "./helpers/DistributorFixture.sol";
import {MerkleTreeLib} from "./helpers/MerkleTreeLib.sol";

contract DistributorFuzzTest is Test, DistributorFixture {
    function testFuzz_everyEntitlementClaimsExactlyItsAmount(uint256 sizeSeed, uint256 amountSeed) public {
        uint256 n = bound(sizeSeed, 1, 12);

        address[] memory accounts = new address[](n);
        uint256[] memory makerAmounts = new uint256[](n);
        uint256[] memory takerAmounts = new uint256[](n);
        bytes32[] memory leaves = new bytes32[](n);
        uint256 total;

        for (uint256 i; i < n; ++i) {
            accounts[i] = address(uint160(1_000 + i));
            makerAmounts[i] = bound(uint256(keccak256(abi.encode(amountSeed, i, "maker"))), 1, 1_000e18);
            takerAmounts[i] = bound(uint256(keccak256(abi.encode(amountSeed, i, "taker"))), 0, 1_000e18);
            leaves[i] = distributor.leafOf(0, accounts[i], makerAmounts[i], takerAmounts[i]);
            total += makerAmounts[i] + takerAmounts[i];
        }

        bytes32 root = MerkleTreeLib.rootOf(leaves);
        _endEpoch(0);
        vm.prank(admin);
        distributor.postClaimRoot(0, root, total);

        for (uint256 i; i < n; ++i) {
            uint256 paid = distributor.claim(
                accounts[i],
                Distributor.ClaimInput({
                    epoch: 0,
                    makerAmount: makerAmounts[i],
                    takerAmount: takerAmounts[i],
                    proof: MerkleTreeLib.proofOf(leaves, leaves[i])
                })
            );

            assertEq(paid, makerAmounts[i] + takerAmounts[i]);
            assertEq(token.balanceOf(accounts[i]), paid);
        }

        assertEq(distributor.claimedTotalOf(0), total);
        assertEq(distributor.totalClaimed(), total);
        assertEq(distributor.unclaimedOf(0), 0);
        assertEq(distributor.fundedBalance(), FUNDED - total);
    }

    function testFuzz_tamperedAmountAlwaysFailsProof(uint256 makerAmount, uint256 takerAmount, uint256 bump) public {
        makerAmount = bound(makerAmount, 1, 1_000e18);
        takerAmount = bound(takerAmount, 0, 1_000e18);
        bump = bound(bump, 1, 1_000e18);

        Entitlement[] memory list =
            _entitlements(Entitlement(maker, makerAmount, takerAmount), Entitlement(taker, 1e18, 0));
        _postEpoch(0, list);

        Distributor.ClaimInput memory input = _claimInput(0, list, 0);
        input.makerAmount = makerAmount + bump;

        vm.expectRevert(abi.encodeWithSelector(Distributor.InvalidProof.selector, 0, maker));
        distributor.claim(maker, input);

        assertEq(token.balanceOf(maker), 0);
    }

    function testFuzz_claimNeverExceedsHeldBalance(uint256 overshoot) public {
        overshoot = bound(overshoot, 1, 1_000_000e18);
        uint256 entitled = FUNDED + overshoot;

        Entitlement[] memory list = _entitlements(Entitlement(maker, entitled, 0), Entitlement(taker, 1e18, 0));
        _postEpoch(0, list);
        Distributor.ClaimInput memory input = _claimInput(0, list, 0);

        vm.expectRevert(abi.encodeWithSelector(Distributor.InsufficientFunds.selector, entitled, FUNDED));
        distributor.claim(maker, input);

        assertEq(distributor.fundedBalance(), FUNDED);
        assertEq(distributor.totalClaimed(), 0);
    }

    function testFuzz_declaredTotalCapsAnEpoch(uint256 declared) public {
        Entitlement[] memory list = _entitlements(Entitlement(maker, 100e18, 0), Entitlement(taker, 100e18, 0));
        declared = bound(declared, 1, 99e18);

        _endEpoch(0);
        bytes32 root = _rootOf(0, list);
        Distributor.ClaimInput memory input = _claimInput(0, list, 0);

        vm.prank(admin);
        distributor.postClaimRoot(0, root, declared);

        vm.expectRevert(abi.encodeWithSelector(Distributor.EpochTotalExceeded.selector, 0, 100e18, declared));
        distributor.claim(maker, input);
    }

    function testFuzz_rootsOnlyPostableForFinishedEpochs(uint256 epoch, uint256 secondsAhead) public {
        epoch = bound(epoch, 0, 10_000);
        secondsAhead = bound(secondsAhead, 0, 20_000 days);

        vm.warp(distributor.epochZeroStart() + secondsAhead);
        uint256 current = distributor.currentEpoch();
        bytes32 root = keccak256(abi.encode(epoch));

        if (epoch < current) {
            vm.prank(admin);
            distributor.postClaimRoot(epoch, root, 1e18);
            assertEq(distributor.claimRootOf(epoch), root);
        } else {
            vm.expectRevert(abi.encodeWithSelector(Distributor.EpochNotEnded.selector, epoch, current));
            vm.prank(admin);
            distributor.postClaimRoot(epoch, root, 1e18);
        }
    }

    function testFuzz_epochStartAndCurrentEpochAgree(uint256 secondsAhead) public {
        secondsAhead = bound(secondsAhead, 0, 20_000 days);
        vm.warp(distributor.epochZeroStart() + secondsAhead);

        uint256 current = distributor.currentEpoch();
        assertLe(distributor.epochStart(current), block.timestamp);
        assertGt(distributor.epochStart(current + 1), block.timestamp);
    }

    function testFuzz_rebatePerRipCapAcceptsAnyShareUpToOne(uint256 cap) public {
        cap = bound(cap, 0, WAD);

        vm.prank(admin);
        distributor.setRebatePerRipCap(cap);
        assertEq(distributor.rebatePerRipCap(), cap);
    }
}
