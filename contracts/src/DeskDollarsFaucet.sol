// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {DeskDollars} from "./DeskDollars.sol";

/// @notice Public, per-wallet rate-limited source of Desk Dollars.
contract DeskDollarsFaucet {
    uint256 public constant CLAIM_AMOUNT = 100 * 10 ** 6;
    uint256 public constant CLAIM_COOLDOWN = 1 hours;

    error ClaimCooldown(address claimant, uint256 nextClaimAt);

    event FaucetClaimed(address indexed claimant, uint256 amount, uint256 nextClaimAt);

    DeskDollars public immutable deskDollars;
    mapping(address claimant => uint256 nextClaimAt) public nextClaimAt;

    constructor(DeskDollars deskDollars_) {
        deskDollars = deskDollars_;
    }

    /// @notice Claims exactly 100 tUSD. Each wallet may claim once per hour.
    function claim() external {
        uint256 claimantNextClaimAt = nextClaimAt[msg.sender];
        if (block.timestamp < claimantNextClaimAt) revert ClaimCooldown(msg.sender, claimantNextClaimAt);

        uint256 nextEligibleAt = block.timestamp + CLAIM_COOLDOWN;
        nextClaimAt[msg.sender] = nextEligibleAt;

        deskDollars.mintFromFaucet(msg.sender, CLAIM_AMOUNT);
        emit FaucetClaimed(msg.sender, CLAIM_AMOUNT, nextEligibleAt);
    }
}
