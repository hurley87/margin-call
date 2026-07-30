// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {console2} from "forge-std/console2.sol";
import {Distributor} from "../src/Distributor.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @notice Fork Robinhood testnet and prove Distributor Maker Emissions claim after warping.
/// @dev Skips when RPC / addresses are unset so default `forge test` stays offline.
///      Run explicitly via `pnpm testnet:e2e:distributor-fork`.
contract ForkDistributorClaim is Test {
    uint256 internal constant RATE = 1e18;
    uint256 internal constant TOKEN_ID = type(uint256).max - 310;

    function test_forkDistributorClaimMakerAfterWarp() public {
        string memory rpc;
        try vm.envString("ROBINHOOD_TESTNET_RPC_URL") returns (string memory url) {
            rpc = url;
        } catch {
            console2.log("skip ForkDistributorClaim: ROBINHOOD_TESTNET_RPC_URL unset");
            return;
        }

        address distributorAddr;
        try vm.envAddress("DISTRIBUTOR_ADDRESS") returns (address d) {
            distributorAddr = d;
        } catch {
            console2.log("skip ForkDistributorClaim: DISTRIBUTOR_ADDRESS unset");
            return;
        }

        vm.createSelectFork(rpc);

        Distributor distributor = Distributor(distributorAddr);
        address ripEngine = distributor.ripEngine();
        require(ripEngine != address(0), "ForkDistributorClaim: Distributor not wired to RipEngine");

        IERC20 token = distributor.gameToken();
        address claimant = makeAddr("claimant");
        uint256 fundedBefore = token.balanceOf(address(distributor));
        require(fundedBefore >= RATE, "ForkDistributorClaim: Distributor underfunded");

        // Simulate a resting Pack via the bound RipEngine (only caller allowed).
        vm.prank(ripEngine);
        distributor.onPackEntered(TOKEN_ID, claimant);

        vm.warp(block.timestamp + distributor.EPOCH_DURATION());

        uint256[] memory ids = new uint256[](1);
        ids[0] = TOKEN_ID;
        uint256 paid = distributor.claimMaker(claimant, ids);

        assertEq(paid, RATE);
        assertEq(token.balanceOf(claimant), RATE);
        assertEq(token.balanceOf(address(distributor)), fundedBefore - RATE);
    }
}
