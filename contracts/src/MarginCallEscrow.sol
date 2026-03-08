// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

interface IIdentityRegistry {
    function ownerOf(uint256 tokenId) external view returns (address);
}

contract MarginCallEscrow {
    using SafeERC20 for IERC20;

    enum DealStatus {
        Open,
        Closed
    }

    struct Deal {
        address creator;
        string prompt;
        uint256 potAmount;
        uint256 entryCost;
        uint256 fee;
        DealStatus status;
        uint256 pendingEntries;
    }

    IERC20 public immutable usdc;
    IIdentityRegistry public immutable identityRegistry;

    address public owner;
    address public operator;
    uint256 public platformFees;
    uint256 public dealCount;

    mapping(uint256 => Deal) public deals;
    mapping(uint256 => uint256) public balances;

    event DealCreated(uint256 indexed dealId, address indexed creator, string prompt, uint256 pot, uint256 entryCost);
    event DealClosed(uint256 indexed dealId);
    event Deposit(uint256 indexed traderId, uint256 amount);
    event Withdrawal(uint256 indexed traderId, uint256 amount);
    event DealEntered(uint256 indexed dealId, uint256 indexed traderId);
    event EntryResolved(uint256 indexed dealId, uint256 indexed traderId, int256 pnl, uint256 rake);
    event FeesWithdrawn(address indexed to, uint256 amount);
    event OperatorUpdated(address indexed newOperator);

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    modifier onlyOperator() {
        require(msg.sender == operator, "Not operator");
        _;
    }

    constructor(address _usdc, address _identityRegistry, address _operator) {
        usdc = IERC20(_usdc);
        identityRegistry = IIdentityRegistry(_identityRegistry);
        owner = msg.sender;
        operator = _operator;
    }

    function createDeal(string calldata prompt, uint256 potAmount, uint256 entryCost)
        external
        returns (uint256 dealId)
    {
        require(potAmount > 0, "Pot must be > 0");
        require(entryCost > 0, "Entry cost must be > 0");

        usdc.safeTransferFrom(msg.sender, address(this), potAmount);

        uint256 fee = (potAmount * 5) / 100;
        uint256 netPot = potAmount - fee;
        platformFees += fee;

        dealId = dealCount++;
        deals[dealId] = Deal({
            creator: msg.sender,
            prompt: prompt,
            potAmount: netPot,
            entryCost: entryCost,
            fee: fee,
            status: DealStatus.Open,
            pendingEntries: 0
        });

        emit DealCreated(dealId, msg.sender, prompt, netPot, entryCost);
    }

    function closeDeal(uint256 dealId) external {
        Deal storage deal = deals[dealId];
        require(msg.sender == deal.creator, "Not deal creator");
        require(deal.status == DealStatus.Open, "Deal not open");
        require(deal.pendingEntries == 0, "Pending entries exist");

        deal.status = DealStatus.Closed;

        if (deal.potAmount > 0) {
            uint256 remaining = deal.potAmount;
            deal.potAmount = 0;
            usdc.safeTransfer(deal.creator, remaining);
        }

        emit DealClosed(dealId);
    }

    function depositFor(uint256 traderId, uint256 amount) external {
        require(identityRegistry.ownerOf(traderId) == msg.sender, "Not NFT owner");
        require(amount > 0, "Amount must be > 0");

        usdc.safeTransferFrom(msg.sender, address(this), amount);
        balances[traderId] += amount;

        emit Deposit(traderId, amount);
    }

    function withdraw(uint256 traderId, uint256 amount) external {
        require(identityRegistry.ownerOf(traderId) == msg.sender, "Not NFT owner");
        require(balances[traderId] >= amount, "Insufficient balance");
        require(amount > 0, "Amount must be > 0");

        balances[traderId] -= amount;
        usdc.safeTransfer(msg.sender, amount);

        emit Withdrawal(traderId, amount);
    }

    function enterDeal(uint256 dealId, uint256 traderId) external onlyOperator {
        Deal storage deal = deals[dealId];
        require(deal.status == DealStatus.Open, "Deal not open");
        require(balances[traderId] >= deal.entryCost, "Insufficient trader balance");

        balances[traderId] -= deal.entryCost;
        deal.potAmount += deal.entryCost;
        deal.pendingEntries++;

        emit DealEntered(dealId, traderId);
    }

    function resolveEntry(uint256 dealId, uint256 traderId, int256 pnl, uint256 rake) external onlyOperator {
        Deal storage deal = deals[dealId];
        require(deal.pendingEntries > 0, "No pending entries");

        if (pnl > 0) {
            uint256 winnings = uint256(pnl);
            require(winnings <= deal.potAmount, "PnL exceeds pot");
            uint256 netWinnings = winnings - rake;
            deal.potAmount -= winnings;
            balances[traderId] += netWinnings;
            platformFees += rake;
        }
        // pnl <= 0: loss already taken at entry, no additional movement

        deal.pendingEntries--;

        emit EntryResolved(dealId, traderId, pnl, rake);
    }

    function withdrawFees() external onlyOwner {
        uint256 amount = platformFees;
        require(amount > 0, "No fees to withdraw");
        platformFees = 0;
        usdc.safeTransfer(owner, amount);

        emit FeesWithdrawn(owner, amount);
    }

    function setOperator(address newOperator) external onlyOwner {
        operator = newOperator;
        emit OperatorUpdated(newOperator);
    }

    function getDeal(uint256 dealId) external view returns (Deal memory) {
        return deals[dealId];
    }

    function getBalance(uint256 traderId) external view returns (uint256) {
        return balances[traderId];
    }
}
