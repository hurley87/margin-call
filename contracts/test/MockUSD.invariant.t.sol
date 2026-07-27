// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {StdInvariant} from "forge-std/StdInvariant.sol";
import {MockUSD} from "../src/MockUSD.sol";

/// @notice Handler that mints and transfers through the public ABI only.
contract MockUSDHandler is Test {
    MockUSD public token;
    address public minter;

    /// @dev Ghost: cumulative amount successfully minted via the handler.
    uint256 public ghostMinted;

    address[] internal actors;

    constructor(MockUSD token_, address minter_) {
        token = token_;
        minter = minter_;
        actors.push(makeAddr("actor0"));
        actors.push(makeAddr("actor1"));
        actors.push(makeAddr("actor2"));
    }

    function mint(uint256 actorSeed, uint256 amountSeed) external {
        address to = actors[bound(actorSeed, 0, actors.length - 1)];
        uint256 amount = bound(amountSeed, 1, 1_000_000e6);

        vm.prank(minter);
        token.mint(to, amount);
        ghostMinted += amount;
    }

    function transfer(uint256 fromSeed, uint256 toSeed, uint256 amountSeed) external {
        address from = actors[bound(fromSeed, 0, actors.length - 1)];
        address to = actors[bound(toSeed, 0, actors.length - 1)];
        if (from == to) return;

        uint256 bal = token.balanceOf(from);
        if (bal == 0) return;

        uint256 amount = bound(amountSeed, 1, bal);
        vm.prank(from);
        token.transfer(to, amount);
    }

    function actorCount() external view returns (uint256) {
        return actors.length;
    }

    function actorAt(uint256 i) external view returns (address) {
        return actors[i];
    }
}

contract MockUSDInvariantTest is StdInvariant, Test {
    MockUSD public token;
    MockUSDHandler public handler;

    address admin = makeAddr("admin");
    address minter = makeAddr("minter");

    function setUp() public {
        token = new MockUSD(admin);
        bytes32 minterRole = token.MINTER_ROLE();
        vm.prank(admin);
        token.grantRole(minterRole, minter);

        handler = new MockUSDHandler(token, minter);
        targetContract(address(handler));
    }

    /// @notice Total supply equals the sum of all successful mints.
    function invariant_totalSupplyEqualsGhostMinted() public view {
        assertEq(token.totalSupply(), handler.ghostMinted());
    }

    /// @notice Sum of actor balances equals total supply (no tokens leak elsewhere).
    function invariant_actorBalancesSumToSupply() public view {
        uint256 sum;
        uint256 n = handler.actorCount();
        for (uint256 i = 0; i < n; i++) {
            sum += token.balanceOf(handler.actorAt(i));
        }
        assertEq(sum, token.totalSupply());
    }

    /// @notice Only the designated minter holds MINTER_ROLE (admin never auto-minted).
    function invariant_onlyHandlerMinterHasRole() public view {
        assertTrue(token.hasRole(token.MINTER_ROLE(), minter));
        assertFalse(token.hasRole(token.MINTER_ROLE(), admin));
        assertFalse(token.hasRole(token.MINTER_ROLE(), address(handler)));
    }
}
