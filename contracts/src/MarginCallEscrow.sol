// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

interface IIdentityRegistry {
    function ownerOf(uint256 tokenId) external view returns (address);
}

interface ISeatVault {
    function hasLockedPrincipal(uint256 traderId) external view returns (bool);
}

contract MarginCallEscrow {
    using SafeERC20 for IERC20;

    uint256 public constant MAX_EXTRACTION_BPS = 2500; // 25%

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
        uint256 reservedAmount;
        uint256 maxExtractionAmount;
    }

    struct EntryInfo {
        uint256 entryTime;
        uint256 entryCost;
        bool pending;
    }

    IERC20 public immutable usdc;
    IIdentityRegistry public immutable identityRegistry;
    ISeatVault public seatVault;

    address public owner;
    address public pendingOwner;
    address public pauser;
    bool public paused;

    mapping(address => bool) public settlementOperators;
    mapping(address => bool) public depositorBinders;

    uint256 public platformFees;
    uint256 public dealCount;
    uint256 public entryTimeoutSeconds;

    mapping(uint256 => Deal) public deals;
    mapping(uint256 => uint256) public balances;
    mapping(uint256 => mapping(uint256 => EntryInfo)) private _entries;
    mapping(uint256 => address) public depositors;

    event DealCreated(uint256 indexed dealId, address indexed creator, string prompt, uint256 pot, uint256 entryCost);
    event DealClosed(uint256 indexed dealId);
    event Deposit(uint256 indexed traderId, uint256 amount);
    event Withdrawal(uint256 indexed traderId, uint256 amount);
    event DealEntered(uint256 indexed dealId, uint256 indexed traderId);
    event EntrySettled(uint256 indexed dealId, uint256 indexed traderId, uint256 grossPayout, uint256 rake);
    event EntryRefunded(uint256 indexed dealId, uint256 indexed traderId, uint256 amount);
    event FeesWithdrawn(address indexed to, uint256 amount);
    event SettlementOperatorUpdated(address indexed operator, bool authorized);
    event DepositorBinderUpdated(address indexed binder, bool authorized);
    event DepositorSet(uint256 indexed traderId, address indexed depositor);
    event OwnershipTransferStarted(address indexed previousOwner, address indexed newOwner);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event Paused(address indexed account);
    event Unpaused(address indexed account);
    event PauserUpdated(address indexed pauser);
    event SeatVaultUpdated(address indexed seatVault);
    event EntryTimeoutUpdated(uint256 seconds_);

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    modifier onlySettlementOperator() {
        require(settlementOperators[msg.sender], "Not settlement operator");
        _;
    }

    modifier onlyDepositorBinder() {
        require(depositorBinders[msg.sender], "Not depositor binder");
        _;
    }

    modifier whenNotPaused() {
        require(!paused, "Paused");
        _;
    }

    modifier onlyPauser() {
        require(msg.sender == owner || msg.sender == pauser, "Not pauser");
        _;
    }

    constructor(
        address _usdc,
        address _identityRegistry,
        address _settlementOperator,
        address _depositorBinder,
        uint256 _entryTimeoutSeconds
    ) {
        require(_usdc != address(0), "Zero USDC");
        require(_identityRegistry != address(0), "Zero registry");
        require(_settlementOperator != address(0), "Zero settlement operator");
        require(_depositorBinder != address(0), "Zero depositor binder");
        require(_entryTimeoutSeconds > 0, "Zero timeout");

        usdc = IERC20(_usdc);
        identityRegistry = IIdentityRegistry(_identityRegistry);
        owner = msg.sender;
        entryTimeoutSeconds = _entryTimeoutSeconds;

        settlementOperators[_settlementOperator] = true;
        depositorBinders[_depositorBinder] = true;
        emit SettlementOperatorUpdated(_settlementOperator, true);
        emit DepositorBinderUpdated(_depositorBinder, true);
    }

    function createDeal(string calldata prompt, uint256 potAmount, uint256 entryCost)
        external
        whenNotPaused
        returns (uint256 dealId)
    {
        require(potAmount > 0, "Pot must be > 0");
        require(entryCost > 0, "Entry cost must be > 0");

        usdc.safeTransferFrom(msg.sender, address(this), potAmount);

        uint256 fee = (potAmount * 5) / 100;
        uint256 netPot = potAmount - fee;
        // Reject pots so small the extraction cap would round to 0 (which would
        // make every winning settlement revert "Exceeds extraction cap").
        require(netPot * MAX_EXTRACTION_BPS >= 10_000, "Pot too small");
        platformFees += fee;

        dealId = dealCount++;
        deals[dealId] = Deal({
            creator: msg.sender,
            prompt: prompt,
            potAmount: netPot,
            entryCost: entryCost,
            fee: fee,
            status: DealStatus.Open,
            pendingEntries: 0,
            reservedAmount: 0,
            maxExtractionAmount: (netPot * MAX_EXTRACTION_BPS) / 10_000
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

    function setDepositor(uint256 traderId, address depositor) external onlyDepositorBinder {
        require(depositor != address(0), "Zero depositor");
        address current = depositors[traderId];
        require(
            current == address(0) || balances[traderId] == 0,
            "Depositor locked while balance > 0"
        );
        if (address(seatVault) != address(0)) {
            require(!seatVault.hasLockedPrincipal(traderId), "Depositor locked while vault principal");
        }
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

    function enterDeal(uint256 dealId, uint256 traderId) external onlySettlementOperator whenNotPaused {
        require(dealId < dealCount, "Deal does not exist");
        Deal storage deal = deals[dealId];
        require(deal.status == DealStatus.Open, "Deal not open");

        address depositor = depositors[traderId];
        require(depositor != address(0), "Zero depositor");
        require(depositor != deal.creator, "Own desk entry");

        require(balances[traderId] >= deal.entryCost, "Insufficient trader balance");
        require(!_entries[dealId][traderId].pending, "Already entered");

        balances[traderId] -= deal.entryCost;
        deal.potAmount += deal.entryCost;
        deal.pendingEntries++;
        deal.reservedAmount += deal.entryCost;

        _entries[dealId][traderId] = EntryInfo({
            entryTime: block.timestamp,
            entryCost: deal.entryCost,
            pending: true
        });

        emit DealEntered(dealId, traderId);
    }

    function settleEntry(uint256 dealId, uint256 traderId, uint256 grossPayout, uint256 rake)
        external
        onlySettlementOperator
        whenNotPaused
    {
        require(dealId < dealCount, "Deal does not exist");
        Deal storage deal = deals[dealId];
        EntryInfo storage entry = _entries[dealId][traderId];

        require(entry.pending, "No pending entry");
        require(grossPayout <= deal.potAmount, "Gross exceeds pot");

        uint256 entryCost = entry.entryCost;
        uint256 profitFromPot = grossPayout > entryCost ? grossPayout - entryCost : 0;
        require(profitFromPot <= deal.maxExtractionAmount, "Exceeds extraction cap");
        require(rake <= profitFromPot, "Rake exceeds profit");
        // A payout may draw down the unreserved pot plus this entry's own reserve,
        // but must leave every other pending entry's principal refundable.
        require(
            grossPayout <= deal.potAmount - deal.reservedAmount + entryCost,
            "Exceeds available pot"
        );

        if (grossPayout > 0) {
            deal.potAmount -= grossPayout;
            balances[traderId] += grossPayout - rake;
            platformFees += rake;
        }

        deal.reservedAmount -= entryCost;
        entry.pending = false;
        deal.pendingEntries--;

        emit EntrySettled(dealId, traderId, grossPayout, rake);
    }

    function refundExpiredEntry(uint256 dealId, uint256 traderId) external {
        require(dealId < dealCount, "Deal does not exist");
        Deal storage deal = deals[dealId];
        EntryInfo storage entry = _entries[dealId][traderId];

        require(entry.pending, "No pending entry");
        require(block.timestamp >= entry.entryTime + entryTimeoutSeconds, "Entry not expired");

        uint256 entryCost = entry.entryCost;
        require(deal.potAmount >= entryCost, "Insufficient pot for refund");

        deal.potAmount -= entryCost;
        balances[traderId] += entryCost;
        deal.reservedAmount -= entryCost;
        entry.pending = false;
        deal.pendingEntries--;

        emit EntryRefunded(dealId, traderId, entryCost);
    }

    function withdrawFees() external onlyOwner {
        uint256 amount = platformFees;
        require(amount > 0, "No fees to withdraw");
        platformFees = 0;
        usdc.safeTransfer(owner, amount);

        emit FeesWithdrawn(owner, amount);
    }

    function pause() external onlyPauser {
        paused = true;
        emit Paused(msg.sender);
    }

    function unpause() external onlyPauser {
        paused = false;
        emit Unpaused(msg.sender);
    }

    function setPauser(address pauser_) external onlyOwner {
        pauser = pauser_;
        emit PauserUpdated(pauser_);
    }

    function setSeatVault(address seatVault_) external onlyOwner {
        seatVault = ISeatVault(seatVault_);
        emit SeatVaultUpdated(seatVault_);
    }

    function setEntryTimeout(uint256 seconds_) external onlyOwner {
        require(seconds_ > 0, "Zero timeout");
        entryTimeoutSeconds = seconds_;
        emit EntryTimeoutUpdated(seconds_);
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

    function addSettlementOperator(address op) external onlyOwner {
        require(op != address(0), "Zero operator");
        settlementOperators[op] = true;
        emit SettlementOperatorUpdated(op, true);
    }

    function removeSettlementOperator(address op) external onlyOwner {
        settlementOperators[op] = false;
        emit SettlementOperatorUpdated(op, false);
    }

    function addDepositorBinder(address binder) external onlyOwner {
        require(binder != address(0), "Zero binder");
        depositorBinders[binder] = true;
        emit DepositorBinderUpdated(binder, true);
    }

    function removeDepositorBinder(address binder) external onlyOwner {
        depositorBinders[binder] = false;
        emit DepositorBinderUpdated(binder, false);
    }

    function getDeal(uint256 dealId) external view returns (Deal memory) {
        return deals[dealId];
    }

    function getBalance(uint256 traderId) external view returns (uint256) {
        return balances[traderId];
    }

    function hasPendingEntry(uint256 dealId, uint256 traderId) external view returns (bool) {
        return _entries[dealId][traderId].pending;
    }

    function getEntry(uint256 dealId, uint256 traderId) external view returns (EntryInfo memory) {
        return _entries[dealId][traderId];
    }
}
