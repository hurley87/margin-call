// SPDX-License-Identifier: MIT
pragma solidity 0.8.29;

import {Test} from "forge-std/Test.sol";

import {MarginCall} from "../../src/MarginCall.sol";
import {MockNvdaC} from "./PositionNftTestDoubles.sol";
import {MarginCallTestBase} from "./MarginCallTestBase.sol";

/// @dev Stateful fuzz handler for shared NVDAc custody vs recorded Position stock.
contract MarginCallHandler is Test {
    uint256 internal constant MAX_LIVE = 16;
    uint256 internal constant MAX_AMOUNT = 50e8;

    MockNvdaC public nvdac;
    MarginCall public marginCall;
    address[] public actors;

    uint256 public liveStock;
    uint256 public donationBalance;
    uint256 public nextExpectedTokenId = 1;

    uint256[] public liveIds;
    mapping(uint256 tokenId => uint256) public recordedStock;
    mapping(uint256 tokenId => address) public recordedOwner;

    constructor(MockNvdaC nvdac_, MarginCall marginCall_, address[] memory actors_) {
        nvdac = nvdac_;
        marginCall = marginCall_;
        actors = actors_;
    }

    function liveCount() external view returns (uint256) {
        return liveIds.length;
    }

    function open(uint256 actorSeed, uint256 amount) public {
        if (liveIds.length >= MAX_LIVE) {
            return;
        }
        amount = _bound(amount, 1, MAX_AMOUNT);
        address actor = _actor(actorSeed);

        nvdac.mint(actor, amount);
        vm.startPrank(actor);
        nvdac.approve(address(marginCall), amount);
        uint256 tokenId = marginCall.openPosition(amount, marginCall.SPOT_LEVERAGE(), 0);
        vm.stopPrank();

        assertEq(tokenId, nextExpectedTokenId, "token id reused or skipped");
        nextExpectedTokenId += 1;

        recordedStock[tokenId] = amount;
        recordedOwner[tokenId] = actor;
        liveIds.push(tokenId);
        liveStock += amount;
    }

    function close(uint256 indexSeed) public {
        if (liveIds.length == 0) {
            return;
        }
        uint256 idx = indexSeed % liveIds.length;
        uint256 tokenId = liveIds[idx];
        address owner = recordedOwner[tokenId];
        uint256 stock = recordedStock[tokenId];

        assertEq(marginCall.ownerOf(tokenId), owner);
        uint256 ownerBefore = nvdac.balanceOf(owner);
        uint256 custodyBefore = nvdac.balanceOf(address(marginCall));

        vm.prank(owner);
        marginCall.closePosition(tokenId);

        assertEq(nvdac.balanceOf(owner), ownerBefore + stock, "close returned another position's stock");
        assertEq(nvdac.balanceOf(address(marginCall)), custodyBefore - stock);
        liveStock -= stock;
        recordedStock[tokenId] = 0;
        recordedOwner[tokenId] = address(0);
        _removeAt(idx);
    }

    function transferTo(uint256 indexSeed, uint256 toSeed) public {
        if (liveIds.length == 0) {
            return;
        }
        uint256 idx = indexSeed % liveIds.length;
        uint256 tokenId = liveIds[idx];
        address from = recordedOwner[tokenId];
        address to = _actor(toSeed);
        if (from == to) {
            return;
        }

        uint256 stockBefore = recordedStock[tokenId];
        uint256 custodyBefore = nvdac.balanceOf(address(marginCall));

        vm.prank(from);
        marginCall.transferFrom(from, to, tokenId);

        assertEq(marginCall.ownerOf(tokenId), to);
        (uint256 stock, uint256 principal, uint256 accruedInterest,, address executor) = marginCall.positions(tokenId);
        assertEq(stock, stockBefore);
        assertEq(principal, 0);
        assertEq(accruedInterest, 0);
        assertEq(executor, address(0));
        assertEq(nvdac.balanceOf(address(marginCall)), custodyBefore);
        recordedOwner[tokenId] = to;
    }

    function donate(uint256 amount) public {
        amount = _bound(amount, 1, MAX_AMOUNT);
        nvdac.mint(address(marginCall), amount);
        donationBalance += amount;
    }

    function _actor(uint256 seed) private view returns (address) {
        return actors[seed % actors.length];
    }

    function _removeAt(uint256 idx) private {
        uint256 last = liveIds.length - 1;
        if (idx != last) {
            liveIds[idx] = liveIds[last];
        }
        liveIds.pop();
    }
}

/// @dev `fail-on-revert` is required: the handler asserts inside its actions, and with the default `false` the
///      runner would discard a reverting action and report a vacuous PASS. Every action early-returns (never
///      reverts) when it has nothing valid to do, so a revert here is always a genuine failure.
/// forge-config: default.invariant.fail-on-revert = true
/// forge-config: ci.invariant.fail-on-revert = true
/// forge-config: ci_fuzz.invariant.fail-on-revert = true
contract MarginCallInvariantTest is MarginCallTestBase {
    MarginCallHandler internal handler;

    function setUp() public override {
        super.setUp();
        address[] memory actors = new address[](3);
        actors[0] = alice;
        actors[1] = bob;
        actors[2] = carol;
        handler = new MarginCallHandler(nvdac, marginCall, actors);

        bytes4[] memory selectors = new bytes4[](4);
        selectors[0] = MarginCallHandler.open.selector;
        selectors[1] = MarginCallHandler.close.selector;
        selectors[2] = MarginCallHandler.transferTo.selector;
        selectors[3] = MarginCallHandler.donate.selector;
        targetSelector(FuzzSelector({addr: address(handler), selectors: selectors}));
        targetContract(address(handler));
        excludeContract(address(marginCall));
        excludeContract(address(nvdac));
    }

    function invariant_recordedStockNeverExceedsCustody() public view {
        uint256 custody = nvdac.balanceOf(address(marginCall));
        assertLe(handler.liveStock(), custody);
        assertEq(custody, handler.liveStock() + handler.donationBalance());
    }

    function invariant_livePositionsRemainIndividuallyBacked() public view {
        uint256 count = handler.liveCount();
        uint256 summed;
        for (uint256 i = 0; i < count; ++i) {
            uint256 tokenId = handler.liveIds(i);
            (uint256 stock,,,,) = marginCall.positions(tokenId);
            assertEq(stock, handler.recordedStock(tokenId));
            assertEq(marginCall.ownerOf(tokenId), handler.recordedOwner(tokenId));
            summed += stock;
        }
        assertEq(summed, handler.liveStock());
        assertLe(summed, nvdac.balanceOf(address(marginCall)));
    }
}
