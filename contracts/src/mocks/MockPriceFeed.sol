// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {IPriceFeed} from "../interfaces/IPriceFeed.sol";

/// @title MockPriceFeed
/// @notice Controllable price-feed double for AssetRegistry NAV tests and testnet seeding.
/// @dev Visibly a test double — not a live oracle. Admin sets price, timestamp, and pause.
contract MockPriceFeed is IPriceFeed, AccessControl {
    bytes32 public constant FEED_ADMIN_ROLE = keccak256("FEED_ADMIN_ROLE");

    /// @notice Always true — on-chain disclosure that this is a test feed.
    bool public constant IS_TEST_FEED = true;

    uint8 private immutable _decimals;

    uint256 private _price;
    uint256 private _updatedAt;
    bool private _paused;
    bool private _valid;

    event AnswerUpdated(uint256 price, uint256 updatedAt, bool paused, bool valid);

    error ZeroAddress();

    /// @param admin Address granted DEFAULT_ADMIN_ROLE and FEED_ADMIN_ROLE.
    /// @param decimals_ Decimal places for the stored price (Chainlink-style 8 is typical).
    /// @param initialPrice Starting price in `decimals_` units.
    constructor(address admin, uint8 decimals_, uint256 initialPrice) {
        if (admin == address(0)) revert ZeroAddress();
        _decimals = decimals_;
        _price = initialPrice;
        _updatedAt = block.timestamp;
        _valid = true;
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(FEED_ADMIN_ROLE, admin);
    }

    /// @inheritdoc IPriceFeed
    function decimals() external view returns (uint8) {
        return _decimals;
    }

    /// @inheritdoc IPriceFeed
    function latestAnswer() external view returns (uint256 price, uint256 updatedAt, bool paused, bool valid) {
        return (_price, _updatedAt, _paused, _valid);
    }

    /// @notice Set the full answer atomically.
    function setAnswer(uint256 price, uint256 updatedAt, bool paused, bool valid) external onlyRole(FEED_ADMIN_ROLE) {
        _price = price;
        _updatedAt = updatedAt;
        _paused = paused;
        _valid = valid;
        emit AnswerUpdated(price, updatedAt, paused, valid);
    }

    /// @notice Convenience: set price and stamp `updatedAt` to now; keep valid and unpaused.
    function setPrice(uint256 price) external onlyRole(FEED_ADMIN_ROLE) {
        _price = price;
        _updatedAt = block.timestamp;
        _paused = false;
        _valid = true;
        emit AnswerUpdated(price, _updatedAt, false, true);
    }

    /// @notice Override the answer timestamp (for staleness tests).
    function setUpdatedAt(uint256 updatedAt) external onlyRole(FEED_ADMIN_ROLE) {
        _updatedAt = updatedAt;
        emit AnswerUpdated(_price, updatedAt, _paused, _valid);
    }

    /// @notice Pause or unpause the feed (consumed reads fail closed while paused).
    function setPaused(bool paused) external onlyRole(FEED_ADMIN_ROLE) {
        _paused = paused;
        emit AnswerUpdated(_price, _updatedAt, paused, _valid);
    }

    /// @notice Mark the answer invalid (fail closed) without changing the stored price.
    function setValid(bool valid) external onlyRole(FEED_ADMIN_ROLE) {
        _valid = valid;
        emit AnswerUpdated(_price, _updatedAt, _paused, valid);
    }
}
