// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

/// @title GameToken
/// @notice Fixed-supply reward token for Maker Emissions and Participation Rewards.
/// @dev The entire supply is minted to the treasury in the constructor and there is no mint
///      authority afterwards, so emission is a *funded Distributor*, not an inflation lever.
///      User↔user transfers fail closed: while the lock holds, a transfer only succeeds when one
///      leg carries `DISTRIBUTOR_ROLE` — Distributor→claimant so claims pay out, and →Distributor
///      so the treasury can fund it. The lock lifts only through the one-way, timelocked
///      `scheduleTransferEnable` → `enableTransfers` pair; nothing re-locks it.
///      Ticker and branding are a post-V1 decision (#297), so the name below is a placeholder.
contract GameToken is ERC20, AccessControl {
    /// @notice Role whose holders are exempt from the transfer lock (the Distributor).
    bytes32 public constant DISTRIBUTOR_ROLE = keccak256("DISTRIBUTOR_ROLE");

    /// @notice Delay between scheduling and exercising the transfer-enable switch.
    /// @dev A constant, not a setter — the owner cannot shorten the notice period.
    uint256 public constant TRANSFER_ENABLE_DELAY = 7 days;

    /// @notice Always true — on-chain disclosure that this is a test asset.
    bool public constant IS_TEST_ASSET = true;

    /// @notice Human-readable disclosure of valueless test status.
    string public constant TEST_ASSET_NOTICE =
        "VALUELESS TEST ASSET - earned reward token for Margin Call testnet only; no claim on revenue or assets";

    /// @notice Address that received the entire fixed supply at deploy.
    address public immutable treasury;

    /// @notice True once the one-way transfer-enable switch has been exercised. Never returns to false.
    bool public transfersEnabled;

    /// @notice Earliest timestamp at which `enableTransfers` may be called; 0 until scheduled.
    uint256 public transferEnableEta;

    event TransferEnableScheduled(uint256 eta);
    event TransfersEnabled(uint256 timestamp);

    error ZeroAddress();
    error ZeroSupply();
    error TransfersLocked(address from, address to);
    error TransferEnableAlreadyScheduled(uint256 eta);
    error TransferEnableNotScheduled();
    error TransferEnableNotElapsed(uint256 eta, uint256 now_);
    error TransfersAlreadyEnabled();

    /// @param admin DEFAULT_ADMIN_ROLE holder (grants DISTRIBUTOR_ROLE, drives the enable switch).
    /// @param treasury_ Recipient of the entire fixed supply.
    /// @param initialSupply Fixed total supply in 18-decimal units; minted once, never again.
    constructor(address admin, address treasury_, uint256 initialSupply)
        ERC20("Margin Call Game Token (Test Asset)", "MCGT")
    {
        if (admin == address(0) || treasury_ == address(0)) revert ZeroAddress();
        if (initialSupply == 0) revert ZeroSupply();

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        treasury = treasury_;
        _mint(treasury_, initialSupply);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // One-way timelocked transfer enable
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Start the notice period for lifting the transfer lock. Callable once.
    /// @dev There is no cancel: scheduling publicly commits to the change `TRANSFER_ENABLE_DELAY`
    ///      ahead of time. Exercising it is still a separate call.
    function scheduleTransferEnable() external onlyRole(DEFAULT_ADMIN_ROLE) returns (uint256 eta) {
        if (transfersEnabled) revert TransfersAlreadyEnabled();
        if (transferEnableEta != 0) revert TransferEnableAlreadyScheduled(transferEnableEta);

        eta = block.timestamp + TRANSFER_ENABLE_DELAY;
        transferEnableEta = eta;
        emit TransferEnableScheduled(eta);
    }

    /// @notice Lift the transfer lock for good, once the scheduled notice period has elapsed.
    function enableTransfers() external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (transfersEnabled) revert TransfersAlreadyEnabled();
        uint256 eta = transferEnableEta;
        if (eta == 0) revert TransferEnableNotScheduled();
        if (block.timestamp < eta) revert TransferEnableNotElapsed(eta, block.timestamp);

        transfersEnabled = true;
        emit TransfersEnabled(block.timestamp);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Views
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice True when a `from` → `to` transfer would pass the lock at the current block.
    function isTransferAllowed(address from, address to) public view returns (bool) {
        return transfersEnabled || hasRole(DISTRIBUTOR_ROLE, from) || hasRole(DISTRIBUTOR_ROLE, to);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Transfer lock
    // ─────────────────────────────────────────────────────────────────────────

    /// @inheritdoc ERC20
    /// @dev Mint (`from == 0`) is the constructor's single supply mint. Burn (`to == 0`) has no
    ///      caller in this contract; both bypass the lock so supply accounting stays plain ERC-20.
    function _update(address from, address to, uint256 value) internal override {
        if (from != address(0) && to != address(0) && !isTransferAllowed(from, to)) {
            revert TransfersLocked(from, to);
        }
        super._update(from, to, value);
    }
}
