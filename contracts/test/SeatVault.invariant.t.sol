// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {StdInvariant} from "forge-std/StdInvariant.sol";
import {SeatVault} from "../src/SeatVault.sol";
import {MarginCallToken} from "../src/MarginCallToken.sol";
import {MockEscrowDepositors} from "./mocks/MockEscrowDepositors.sol";

contract SeatVaultHandler is Test {
    SeatVault public vault;
    MarginCallToken public token;
    MockEscrowDepositors public escrow;

    address public desk;
    uint256 public constant TRADER = 1;
    uint256 public constant COOLDOWN = 1 days;

    constructor(SeatVault vault_, MarginCallToken token_, MockEscrowDepositors escrow_, address desk_) {
        vault = vault_;
        token = token_;
        escrow = escrow_;
        desk = desk_;
    }

    function stake(uint256 amountSeed) external {
        uint256 amount = bound(amountSeed, 1, 50_000e18);
        if (token.balanceOf(desk) < amount) {
            token.mint(desk, amount);
        }
        vm.startPrank(desk);
        token.approve(address(vault), type(uint256).max);
        try vault.stake(TRADER, amount) {} catch {}
        vm.stopPrank();
    }

    function initiateUnstake(uint256 amountSeed) external {
        SeatVault.StakeInfo memory info = vault.stakeOf(TRADER);
        if (info.active == 0) return;
        uint256 amount = bound(amountSeed, 1, info.active);
        vm.prank(desk);
        try vault.initiateUnstake(TRADER, amount) {} catch {}
    }

    function completeUnstake() external {
        SeatVault.StakeInfo memory info = vault.stakeOf(TRADER);
        if (info.pending == 0) return;
        if (block.timestamp < info.unlockTime) {
            vm.warp(info.unlockTime);
        }
        try vault.completeUnstake(TRADER) {} catch {}
    }

    function flipDepositor(bool toOther) external {
        address other = address(uint160(uint256(keccak256("otherDesk"))));
        escrow.setDepositor(TRADER, toOther ? other : desk);
    }
}

contract SeatVaultInvariantTest is StdInvariant, Test {
    SeatVault public vault;
    MarginCallToken public token;
    MockEscrowDepositors public escrow;
    SeatVaultHandler public handler;

    address desk = makeAddr("desk");

    function setUp() public {
        token = new MarginCallToken();
        escrow = new MockEscrowDepositors();
        vault = new SeatVault(address(escrow), address(token), 10_000e18, 50_000e18, 1 days);
        escrow.setDepositor(1, desk);
        token.mint(desk, 10_000_000e18);
        vm.prank(desk);
        token.approve(address(vault), type(uint256).max);

        handler = new SeatVaultHandler(vault, token, escrow, desk);
        // desk is pre-funded with 10M so bounded stakes never need on-the-fly mint
        // (MarginCallToken.mint is onlyOwner and the handler is not the owner).
        targetContract(address(handler));
    }

    function invariant_totalPrincipalMatchesTokenBalance() public view {
        assertEq(vault.totalPrincipal(), token.balanceOf(address(vault)));
    }

    function invariant_stakePartsSumToTotal() public view {
        SeatVault.StakeInfo memory info = vault.stakeOf(1);
        assertEq(info.active + info.pending, vault.totalPrincipal());
    }

    function invariant_tierGalleryWhenDepositorMismatch() public view {
        SeatVault.StakeInfo memory info = vault.stakeOf(1);
        address depositor = escrow.depositors(1);
        if (info.active > 0 && (depositor == address(0) || depositor != info.staker)) {
            assertEq(uint8(vault.tierOf(1)), uint8(SeatVault.Tier.Gallery));
        }
    }
}
