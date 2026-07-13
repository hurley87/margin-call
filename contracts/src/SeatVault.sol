// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

interface IEscrowDepositors {
    function depositors(uint256 traderId) external view returns (address);
}

/// @notice Custodies MARGINCALL principal staked against traders for capacity tiers.
/// @dev Staking authority is the current MarginCallEscrow depositor for each traderId.
contract SeatVault {
    using SafeERC20 for IERC20;

    enum Tier {
        Gallery,
        Seat,
        CornerOffice
    }

    struct StakeInfo {
        address staker;
        uint256 active;
        uint256 pending;
        uint256 unlockTime;
    }

    IEscrowDepositors public immutable escrow;

    address public owner;
    address public pendingOwner;
    address public pauser;

    bool public paused;

    IERC20 public token;
    uint256 public seatThreshold;
    uint256 public cornerOfficeThreshold;
    uint256 public unstakeCooldown;

    uint256 public totalPrincipal;

    mapping(uint256 => StakeInfo) private _stakes;

    event Staked(uint256 indexed traderId, address indexed staker, uint256 amount);
    event UnstakeInitiated(uint256 indexed traderId, address indexed staker, uint256 amount, uint256 unlockTime);
    event Unstaked(uint256 indexed traderId, address indexed staker, uint256 amount);
    event PolicyUpdated(uint256 seatThreshold, uint256 cornerOfficeThreshold, uint256 unstakeCooldown);
    event TokenUpdated(address indexed token);
    event OwnershipTransferStarted(address indexed previousOwner, address indexed newOwner);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event Paused(address indexed account);
    event Unpaused(address indexed account);
    event PauserUpdated(address indexed pauser);

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    modifier whenNotPaused() {
        require(!paused, "Paused");
        _;
    }

    constructor(
        address escrow_,
        address token_,
        uint256 seatThreshold_,
        uint256 cornerOfficeThreshold_,
        uint256 unstakeCooldown_
    ) {
        require(escrow_ != address(0), "Zero escrow");
        require(token_ != address(0), "Zero token");
        require(cornerOfficeThreshold_ >= seatThreshold_, "Corner below seat");

        escrow = IEscrowDepositors(escrow_);
        token = IERC20(token_);
        seatThreshold = seatThreshold_;
        cornerOfficeThreshold = cornerOfficeThreshold_;
        unstakeCooldown = unstakeCooldown_;
        owner = msg.sender;
    }

    function stake(uint256 traderId, uint256 amount) external whenNotPaused {
        require(amount > 0, "Zero amount");

        address depositor = escrow.depositors(traderId);
        require(depositor != address(0), "Zero depositor");
        require(depositor == msg.sender, "Not depositor");

        StakeInfo storage info = _stakes[traderId];
        require(info.staker == address(0) || info.staker == msg.sender, "Foreign principal");

        uint256 balanceBefore = token.balanceOf(address(this));
        token.safeTransferFrom(msg.sender, address(this), amount);
        uint256 received = token.balanceOf(address(this)) - balanceBefore;
        require(received > 0, "Zero received");

        if (info.staker == address(0)) {
            info.staker = msg.sender;
        }

        info.active += received;
        totalPrincipal += received;

        emit Staked(traderId, msg.sender, received);
    }

    function initiateUnstake(uint256 traderId, uint256 amount) external whenNotPaused {
        require(amount > 0, "Zero amount");

        StakeInfo storage info = _stakes[traderId];
        require(info.staker != address(0), "No stake");
        require(info.active >= amount, "Over unstake");
        require(msg.sender == info.staker, "Not staker");

        info.active -= amount;
        info.pending += amount;
        if (info.pending == amount) {
            info.unlockTime = block.timestamp + unstakeCooldown;
        }

        emit UnstakeInitiated(traderId, info.staker, amount, info.unlockTime);
    }

    function completeUnstake(uint256 traderId) external {
        StakeInfo storage info = _stakes[traderId];
        uint256 pending = info.pending;
        require(pending > 0, "Nothing pending");
        require(block.timestamp >= info.unlockTime, "Cooldown active");

        address staker = info.staker;
        require(staker != address(0), "No staker");

        info.pending = 0;
        info.unlockTime = 0;
        if (info.active == 0) {
            info.staker = address(0);
        }

        totalPrincipal -= pending;
        token.safeTransfer(staker, pending);

        emit Unstaked(traderId, staker, pending);
    }

    function setPolicy(uint256 seatThreshold_, uint256 cornerOfficeThreshold_, uint256 unstakeCooldown_)
        external
        onlyOwner
    {
        require(cornerOfficeThreshold_ >= seatThreshold_, "Corner below seat");

        seatThreshold = seatThreshold_;
        cornerOfficeThreshold = cornerOfficeThreshold_;
        unstakeCooldown = unstakeCooldown_;

        emit PolicyUpdated(seatThreshold_, cornerOfficeThreshold_, unstakeCooldown_);
    }

    function setToken(address token_) external onlyOwner {
        require(token_ != address(0), "Zero token");
        require(totalPrincipal == 0, "Principal outstanding");

        token = IERC20(token_);
        emit TokenUpdated(token_);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Zero owner");
        pendingOwner = newOwner;
        emit OwnershipTransferStarted(owner, newOwner);
    }

    function acceptOwnership() external {
        require(msg.sender == pendingOwner, "Not pending owner");
        address previousOwner = owner;
        owner = pendingOwner;
        pendingOwner = address(0);
        emit OwnershipTransferred(previousOwner, owner);
    }

    function stakeOf(uint256 traderId) external view returns (StakeInfo memory) {
        return _stakes[traderId];
    }

    function hasLockedPrincipal(uint256 traderId) external view returns (bool) {
        StakeInfo storage info = _stakes[traderId];
        return info.active + info.pending > 0;
    }

    function pause() external {
        require(msg.sender == owner || msg.sender == pauser, "Not pauser");
        paused = true;
        emit Paused(msg.sender);
    }

    function unpause() external {
        require(msg.sender == owner || msg.sender == pauser, "Not pauser");
        paused = false;
        emit Unpaused(msg.sender);
    }

    function setPauser(address pauser_) external onlyOwner {
        pauser = pauser_;
        emit PauserUpdated(pauser_);
    }

    function tierOf(uint256 traderId) external view returns (Tier) {
        StakeInfo storage info = _stakes[traderId];
        if (info.active == 0) {
            return Tier.Gallery;
        }

        address depositor = escrow.depositors(traderId);
        if (depositor == address(0) || depositor != info.staker) {
            return Tier.Gallery;
        }

        if (info.active >= cornerOfficeThreshold) {
            return Tier.CornerOffice;
        }
        if (info.active >= seatThreshold) {
            return Tier.Seat;
        }
        return Tier.Gallery;
    }
}
