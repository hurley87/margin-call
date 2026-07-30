// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {StdInvariant} from "forge-std/StdInvariant.sol";
import {Distributor} from "../src/Distributor.sol";
import {GameToken} from "../src/GameToken.sol";
import {DistributorFixture} from "./helpers/DistributorFixture.sol";

/// @notice Handler that drives Pack lifecycle, rates, pots, Rips, funding, and claims.
contract DistributorHandler is Test {
    Distributor public immutable distributor;
    GameToken public immutable token;
    address public immutable admin;
    address public immutable treasury;
    address public immutable ripEngine;
    address public immutable maker;
    address public immutable maker2;
    address public immutable taker;
    address public immutable taker2;

    uint256 public nextTokenId = 1;
    uint256[] public activeIds;
    mapping(uint256 => bool) public isActive;
    mapping(uint256 => address) public ownerOf;

    uint256 public ghostMakerPaid;
    uint256 public ghostTakerPaid;

    constructor(
        Distributor distributor_,
        GameToken token_,
        address admin_,
        address treasury_,
        address ripEngine_,
        address maker_,
        address maker2_,
        address taker_,
        address taker2_
    ) {
        distributor = distributor_;
        token = token_;
        admin = admin_;
        treasury = treasury_;
        ripEngine = ripEngine_;
        maker = maker_;
        maker2 = maker2_;
        taker = taker_;
        taker2 = taker2_;
    }

    function enter(uint8 whoSel) external {
        address who = whoSel % 2 == 0 ? maker : maker2;
        uint256 id = nextTokenId++;
        vm.prank(ripEngine);
        distributor.onPackEntered(id, who);
        activeIds.push(id);
        isActive[id] = true;
        ownerOf[id] = who;
    }

    function exit(uint256 indexSeed) external {
        if (activeIds.length == 0) return;
        uint256 index = indexSeed % activeIds.length;
        uint256 id = activeIds[index];
        vm.prank(ripEngine);
        distributor.onPackExited(id);
        isActive[id] = false;
        ownerOf[id] = address(0);
        activeIds[index] = activeIds[activeIds.length - 1];
        activeIds.pop();
    }

    function warp(uint16 seconds_) external {
        vm.warp(block.timestamp + uint256(seconds_) + 1);
    }

    function setMakerRate(uint128 rate) external {
        vm.prank(admin);
        distributor.setMakerRatePerEpoch(rate);
    }

    function setTakerPot(uint128 pot) external {
        vm.prank(admin);
        distributor.setTakerPotPerEpoch(pot);
    }

    function rip(uint8 whoSel, uint8 count_) external {
        address who = whoSel % 2 == 0 ? taker : taker2;
        uint256 count = uint256(count_ % 5) + 1;
        vm.prank(ripEngine);
        distributor.onRip(who, count);
    }

    function claimMaker(uint8 whoSel) external {
        address who = whoSel % 2 == 0 ? maker : maker2;
        uint256[] memory ids = _activeOwned(who);
        uint256 owed = distributor.claimableMakerOf(who, ids);
        if (owed == 0) return;
        if (owed > distributor.fundedBalance()) return;
        uint256 paid = distributor.claimMaker(who, ids);
        ghostMakerPaid += paid;
    }

    function claimTaker(uint8 whoSel) external {
        address who = whoSel % 2 == 0 ? taker : taker2;
        uint256 current = distributor.currentEpoch();
        if (current == 0) return;

        uint256 epoch = current - 1;
        if (distributor.hasClaimed(epoch, who)) return;
        uint256 owed = distributor.claimableTakerOf(who, epoch);
        if (distributor.accountRipCountOf(epoch, who) == 0) return;
        if (owed > distributor.fundedBalance()) return;

        uint256[] memory epochs = new uint256[](1);
        epochs[0] = epoch;
        uint256 paid = distributor.claimTaker(who, epochs);
        ghostTakerPaid += paid;
    }

    function fund(uint128 amount) external {
        uint256 bal = token.balanceOf(treasury);
        if (bal == 0 || amount == 0) return;
        uint256 send = amount % bal;
        if (send == 0) return;
        vm.prank(treasury);
        token.transfer(address(distributor), send);
    }

    function _activeOwned(address who) internal view returns (uint256[] memory ids) {
        uint256 n;
        for (uint256 i; i < activeIds.length; ++i) {
            if (ownerOf[activeIds[i]] == who) ++n;
        }
        ids = new uint256[](n);
        uint256 j;
        for (uint256 i; i < activeIds.length; ++i) {
            uint256 id = activeIds[i];
            if (ownerOf[id] == who) ids[j++] = id;
        }
    }
}

contract DistributorInvariantTest is StdInvariant, Test, DistributorFixture {
    DistributorHandler internal handler;

    function setUp() public override {
        super.setUp();

        vm.startPrank(admin);
        distributor.setMakerRatePerEpoch(1_000e18);
        distributor.setTakerPotPerEpoch(10_000e18);
        vm.stopPrank();

        handler = new DistributorHandler(distributor, token, admin, treasury, ripEngine, maker, maker2, taker, taker2);
        targetContract(address(handler));
    }

    function invariant_totalClaimedNeverExceedsInitialPlusTopUps() public view {
        uint256 paidOut =
            token.balanceOf(maker) + token.balanceOf(maker2) + token.balanceOf(taker) + token.balanceOf(taker2);
        assertEq(paidOut, distributor.totalClaimed());
        assertLe(distributor.totalClaimed(), FUNDED + (TOTAL_SUPPLY - FUNDED - token.balanceOf(treasury)));
    }

    function invariant_conservationOfFundedTokens() public view {
        uint256 paidOut =
            token.balanceOf(maker) + token.balanceOf(maker2) + token.balanceOf(taker) + token.balanceOf(taker2);
        assertEq(paidOut + distributor.fundedBalance() + token.balanceOf(treasury), TOTAL_SUPPLY);
    }

    function invariant_supplyNeverInflates() public view {
        assertEq(token.totalSupply(), TOTAL_SUPPLY);
    }

    function invariant_ghostPaymentsMatchBalances() public view {
        assertEq(handler.ghostMakerPaid() + handler.ghostTakerPaid(), distributor.totalClaimed());
    }

    function invariant_closedEpochSharesNeverExceedPot() public view {
        uint256 current = distributor.currentEpoch();
        if (current == 0) return;
        uint256 epoch = current - 1;
        uint256 total = distributor.ripCountOf(epoch);
        if (total == 0) return;

        uint256 pot = distributor.potOf(epoch);
        uint256 sum;
        address[4] memory accounts = [maker, maker2, taker, taker2];
        for (uint256 i; i < accounts.length; ++i) {
            uint256 mine = distributor.accountRipCountOf(epoch, accounts[i]);
            if (mine == 0) continue;
            sum += (pot * mine) / total;
        }
        // Only accounts the handler uses; may under-count if other addresses ripped, but handler
        // only rips taker/taker2, so this is exact for our ghost world when makers never rip.
        assertLe(sum, pot);
    }
}
