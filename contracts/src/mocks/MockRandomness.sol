// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {IRandomnessSource} from "../interfaces/IRandomnessSource.sol";

/// @title MockRandomness
/// @notice Deterministic randomness double for RipEngine tests and V1 House seeding.
/// @dev Visibly a test double — not a verifiable beacon. Admin sets the base seed; each
///      `nextSeed` mixes base + monotonic nonce + salt. The disclosed House keeper (#309)
///      can rotate the seed between rips.
contract MockRandomness is IRandomnessSource, AccessControl {
    bytes32 public constant SEED_ADMIN_ROLE = keccak256("SEED_ADMIN_ROLE");

    /// @notice Always true — on-chain disclosure that this is a test source.
    bool public constant IS_TEST_SOURCE = true;

    uint256 private _baseSeed;
    uint256 private _nonce;

    event SeedUpdated(uint256 baseSeed);
    event SeedConsumed(uint256 indexed nonce, bytes32 salt, uint256 seed);

    error ZeroAddress();

    /// @param admin Address granted DEFAULT_ADMIN_ROLE and SEED_ADMIN_ROLE.
    /// @param initialSeed Starting base seed (any non-zero value is fine; zero is allowed).
    constructor(address admin, uint256 initialSeed) {
        if (admin == address(0)) revert ZeroAddress();
        _baseSeed = initialSeed;
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(SEED_ADMIN_ROLE, admin);
    }

    /// @inheritdoc IRandomnessSource
    function nextSeed(bytes32 salt) external returns (uint256 seed) {
        uint256 n = ++_nonce;
        seed = uint256(keccak256(abi.encodePacked(_baseSeed, n, salt, block.timestamp, block.prevrandao)));
        emit SeedConsumed(n, salt, seed);
    }

    /// @notice Rotate the base seed (House operator / test harness).
    function setSeed(uint256 newBaseSeed) external onlyRole(SEED_ADMIN_ROLE) {
        _baseSeed = newBaseSeed;
        emit SeedUpdated(newBaseSeed);
    }

    /// @notice Current base seed (for tests / disclosure).
    function baseSeed() external view returns (uint256) {
        return _baseSeed;
    }

    /// @notice How many seeds have been consumed.
    function nonce() external view returns (uint256) {
        return _nonce;
    }
}
