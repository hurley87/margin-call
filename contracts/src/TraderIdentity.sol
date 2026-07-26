// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";

/// @notice Transferable Trader identity for The Floor.
/// @dev Non-upgradeable by design: custody rules must not change beneath active
///      positions. Ownership is a standard, permissionlessly transferable
///      ERC-721 with no lockup, so a Trader can be sold on any external
///      marketplace.
///
///      Every transfer advances the token's authority epoch. Downstream
///      contracts bind delegated agent keys and signed offers to an epoch, so
///      advancing it retires the previous owner's authority without needing an
///      explicit revocation from them. A transfer also clears the claim flag:
///      the new owner must claim the Trader before automation may resume.
contract TraderIdentity is ERC721 {
    address public owner;
    address public pendingOwner;

    string private _baseTokenURI;

    uint256 private _nextTokenId = 1;

    mapping(uint256 => uint64) private _authorityEpoch;
    mapping(uint256 => bool) private _claimed;

    event TraderCreated(uint256 indexed tokenId, address indexed traderOwner);
    event AuthorityEpochAdvanced(
        uint256 indexed tokenId, address indexed previousOwner, address indexed newOwner, uint64 epoch
    );
    event TraderClaimed(uint256 indexed tokenId, address indexed traderOwner, uint64 epoch);
    event BaseURIUpdated(string baseURI);
    event OwnershipTransferStarted(address indexed previousOwner, address indexed newOwner);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    constructor(string memory name_, string memory symbol_, string memory baseTokenURI_) ERC721(name_, symbol_) {
        _baseTokenURI = baseTokenURI_;
        owner = msg.sender;
    }

    /// @notice Create a Trader owned by `to`.
    /// @dev Permissionless: the House sponsors gas but must not gate identity
    ///      creation, so a desk's ownership is never shared with the House.
    ///      The creator is the first owner and needs no separate claim.
    function mint(address to) external returns (uint256 tokenId) {
        require(to != address(0), "Zero owner");

        tokenId = _nextTokenId++;
        _authorityEpoch[tokenId] = 1;
        _claimed[tokenId] = true;

        _safeMint(to, tokenId);

        emit TraderCreated(tokenId, to);
    }

    /// @notice Claim a Trader received by transfer, re-enabling automation.
    function claim(uint256 tokenId) external {
        address traderOwner = _requireOwned(tokenId);
        require(msg.sender == traderOwner, "Not trader owner");
        require(!_claimed[tokenId], "Already claimed");

        _claimed[tokenId] = true;

        emit TraderClaimed(tokenId, traderOwner, _authorityEpoch[tokenId]);
    }

    /// @notice Current authority epoch, or zero if the Trader does not exist.
    function authorityEpoch(uint256 tokenId) external view returns (uint64) {
        return _authorityEpoch[tokenId];
    }

    /// @notice Whether the current owner has claimed the Trader.
    function isClaimed(uint256 tokenId) external view returns (bool) {
        return _claimed[tokenId];
    }

    /// @notice Owner, epoch, and claim state in one read for indexers and UI.
    function traderState(uint256 tokenId) external view returns (address traderOwner, uint64 epoch, bool claimed_) {
        traderOwner = _requireOwned(tokenId);
        return (traderOwner, _authorityEpoch[tokenId], _claimed[tokenId]);
    }

    function totalMinted() external view returns (uint256) {
        return _nextTokenId - 1;
    }

    function setBaseURI(string calldata baseTokenURI_) external onlyOwner {
        _baseTokenURI = baseTokenURI_;
        emit BaseURIUpdated(baseTokenURI_);
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

    function _baseURI() internal view override returns (string memory) {
        return _baseTokenURI;
    }

    /// @dev Advances the authority epoch on every ownership change. A
    ///      self-transfer still advances it: treating a real transfer as a
    ///      no-op would leave the decision of whether authority survives up to
    ///      the caller, and failing closed is the safer default.
    function _update(address to, uint256 tokenId, address auth) internal override returns (address) {
        address from = super._update(to, tokenId, auth);

        if (from != address(0)) {
            uint64 epoch = _authorityEpoch[tokenId] + 1;
            _authorityEpoch[tokenId] = epoch;
            _claimed[tokenId] = false;
            emit AuthorityEpochAdvanced(tokenId, from, to, epoch);
        }

        return from;
    }
}
