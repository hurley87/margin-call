// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

/// @title GameToken
/// @notice Fixed-supply reward token for Maker Emissions and Participation Rewards.
/// @dev The entire supply is minted to the treasury in the constructor and there is no mint
///      authority afterwards, so emission is a *funded Distributor*, not an inflation lever.
///      User↔user transfers fail closed. While the lock holds only two moves are legal: a
///      `DISTRIBUTOR_ROLE` holder paying anyone (Distributor→claimant, so claims settle) and the
///      treasury paying a role holder (funding). Everything else reverts, including a claimant
///      sending tokens *into* the Distributor, which would otherwise burn them irrecoverably.
///      The lock lifts only through the one-way, timelocked `scheduleTransferEnable` →
///      `enableTransfers` pair; nothing re-locks it.
///      Ticker and branding are a post-V1 decision (#297), so the name below is a placeholder.
contract GameToken is ERC20, AccessControl {
    /// @notice Role whose holders are exempt from the transfer lock (the Distributor).
    bytes32 public constant DISTRIBUTOR_ROLE = keccak256("DISTRIBUTOR_ROLE");

    /// @notice Notice period between scheduling and exercising the transfer-enable switch.
    /// @dev A constant, not a setter — the owner cannot shorten the notice period.
    uint256 public constant TRANSFER_ENABLE_DELAY = 7 days;

    /// @notice How long a matured schedule stays exercisable before it expires.
    /// @dev Without this the notice period would be meaningless for any decision taken long after
    ///      the eta: an admin could arm the switch, wait a year, and unlock in the next block with
    ///      no recent warning. An expired schedule must be re-armed, which restarts the notice.
    uint256 public constant TRANSFER_ENABLE_WINDOW = 7 days;

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
    error TransferEnableExpired(uint256 deadline, uint256 now_);
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

    /// @notice Start the notice period for lifting the transfer lock.
    /// @dev There is no cancel — scheduling publicly commits to the change `TRANSFER_ENABLE_DELAY`
    ///      ahead of time, and exercising it is still a separate call. A schedule that is never
    ///      exercised expires on its own, after which this may be called again for a fresh notice.
    function scheduleTransferEnable() external onlyRole(DEFAULT_ADMIN_ROLE) returns (uint256 eta) {
        if (transfersEnabled) revert TransfersAlreadyEnabled();
        uint256 pending = transferEnableEta;
        if (pending != 0 && block.timestamp <= pending + TRANSFER_ENABLE_WINDOW) {
            revert TransferEnableAlreadyScheduled(pending);
        }

        eta = block.timestamp + TRANSFER_ENABLE_DELAY;
        transferEnableEta = eta;
        emit TransferEnableScheduled(eta);
    }

    /// @notice Lift the transfer lock for good, inside the scheduled execution window.
    function enableTransfers() external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (transfersEnabled) revert TransfersAlreadyEnabled();
        uint256 eta = transferEnableEta;
        if (eta == 0) revert TransferEnableNotScheduled();
        if (block.timestamp < eta) revert TransferEnableNotElapsed(eta, block.timestamp);

        uint256 deadline = eta + TRANSFER_ENABLE_WINDOW;
        if (block.timestamp > deadline) revert TransferEnableExpired(deadline, block.timestamp);

        transfersEnabled = true;
        emit TransfersEnabled(block.timestamp);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Views
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Last timestamp at which the pending schedule may be exercised; 0 when none is set.
    function transferEnableDeadline() public view returns (uint256) {
        uint256 eta = transferEnableEta;
        return eta == 0 ? 0 : eta + TRANSFER_ENABLE_WINDOW;
    }

    /// @notice True when a scheduled enable is still live (pending or exercisable).
    function isTransferEnableScheduled() public view returns (bool) {
        return !transfersEnabled && transferEnableEta != 0 && block.timestamp <= transferEnableDeadline();
    }

    /// @notice True when a `from` → `to` transfer would pass the lock at the current block.
    /// @dev Two exemptions while locked, and no more: a role holder paying out, and the treasury
    ///      funding a role holder. Sending *into* a role holder from anywhere else stays blocked.
    function isTransferAllowed(address from, address to) public view returns (bool) {
        if (transfersEnabled) return true;
        if (hasRole(DISTRIBUTOR_ROLE, from)) return true;
        return from == treasury && hasRole(DISTRIBUTOR_ROLE, to);
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
