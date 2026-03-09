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
    mapping(address => bool) public authorizedOperators;
    uint256 public platformFees;
    uint256 public dealCount;

    mapping(uint256 => Deal) public deals;
    mapping(uint256 => uint256) public balances;
    /// @dev Per-deal queue of trader IDs that entered; resolveEntry must credit the head.
    mapping(uint256 => uint256[]) private _pendingTraderIds;
    /// @dev Authorized depositor per trader — decoupled from NFT ownership.
    mapping(uint256 => address) public depositors;

    event DealCreated(uint256 indexed dealId, address indexed creator, string prompt, uint256 pot, uint256 entryCost);
    event DealClosed(uint256 indexed dealId);
    event Deposit(uint256 indexed traderId, uint256 amount);
    event Withdrawal(uint256 indexed traderId, uint256 amount);
    event DealEntered(uint256 indexed dealId, uint256 indexed traderId);
    event EntryResolved(uint256 indexed dealId, uint256 indexed traderId, int256 pnl, uint256 rake);
    event FeesWithdrawn(address indexed to, uint256 amount);
    event OperatorUpdated(address indexed newOperator);
    event DepositorSet(uint256 indexed traderId, address indexed depositor);

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    modifier onlyOperator() {
        require(authorizedOperators[msg.sender], "Not operator");
        _;
    }

    constructor(address _usdc, address _identityRegistry, address _operator) {
        require(_usdc != address(0), "Zero USDC");
        require(_identityRegistry != address(0), "Zero registry");
        require(_operator != address(0), "Zero operator");
        usdc = IERC20(_usdc);
        identityRegistry = IIdentityRegistry(_identityRegistry);
        owner = msg.sender;
        authorizedOperators[_operator] = true;
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
        require(dealId < dealCount, "Deal does not exist");
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

    function setDepositor(uint256 traderId, address depositor) external onlyOperator {
        require(depositor != address(0), "Zero depositor");
        depositors[traderId] = depositor;
        emit DepositorSet(traderId, depositor);
    }

    function depositFor(uint256 traderId, uint256 amount) external {
        require(depositors[traderId] == msg.sender, "Not depositor");
        require(amount > 0, "Amount must be > 0");

        usdc.safeTransferFrom(msg.sender, address(this), amount);
        balances[traderId] += amount;

        emit Deposit(traderId, amount);
    }

    function withdraw(uint256 traderId, uint256 amount) external {
        require(depositors[traderId] == msg.sender, "Not depositor");
        require(balances[traderId] >= amount, "Insufficient balance");
        require(amount > 0, "Amount must be > 0");

        balances[traderId] -= amount;
        usdc.safeTransfer(msg.sender, amount);

        emit Withdrawal(traderId, amount);
    }

    function enterDeal(uint256 dealId, uint256 traderId) external onlyOperator {
        require(dealId < dealCount, "Deal does not exist");
        Deal storage deal = deals[dealId];
        require(deal.status == DealStatus.Open, "Deal not open");
        require(balances[traderId] >= deal.entryCost, "Insufficient trader balance");

        balances[traderId] -= deal.entryCost;
        deal.potAmount += deal.entryCost;
        deal.pendingEntries++;
        _pendingTraderIds[dealId].push(traderId);

        emit DealEntered(dealId, traderId);
    }

    function resolveEntry(uint256 dealId, uint256 traderId, int256 pnl, uint256 rake) external onlyOperator {
        require(dealId < dealCount, "Deal does not exist");
        Deal storage deal = deals[dealId];
        require(deal.pendingEntries > 0, "No pending entries");
        uint256[] storage queue = _pendingTraderIds[dealId];
        require(queue.length > 0 && queue[0] == traderId, "Trader mismatch");

        if (pnl > 0) {
            uint256 winnings = uint256(pnl);
            require(winnings <= deal.potAmount, "PnL exceeds pot");
            require(rake <= winnings, "Rake exceeds winnings");
            uint256 netWinnings = winnings - rake;
            deal.potAmount -= winnings;
            balances[traderId] += netWinnings;
            platformFees += rake;
        }
        // pnl <= 0: loss already taken at entry, no additional movement

        // Remove head of queue (swap with last, pop)
        if (queue.length > 1) {
            queue[0] = queue[queue.length - 1];
        }
        queue.pop();
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

    function addOperator(address op) external onlyOwner {
        require(op != address(0), "Zero operator");
        authorizedOperators[op] = true;
        emit OperatorUpdated(op);
    }

    function removeOperator(address op) external onlyOwner {
        authorizedOperators[op] = false;
        emit OperatorUpdated(op);
    }

    function getDeal(uint256 dealId) external view returns (Deal memory) {
        return deals[dealId];
    }

    function getBalance(uint256 traderId) external view returns (uint256) {
        return balances[traderId];
    }
}
