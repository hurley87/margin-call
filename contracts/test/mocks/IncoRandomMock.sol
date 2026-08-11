// SPDX-License-Identifier: MIT
pragma solidity 0.8.29;

import {ETypes, euint256} from "@inco/lightning/src/Types.sol";

/// @notice Shared test double for the Inco Lightning singleton, etched over its address.
contract IncoRandomMock {
    uint256 public fee;
    bytes32 public randomHandle;
    bool public shouldRevertRandom;
    address public verifier;
    mapping(bytes32 handle => mapping(address account => bool isAllowed)) internal _transientAllowances;
    mapping(bytes32 handle => mapping(address account => bool isAllowed)) internal _persistentAllowances;
    mapping(bytes32 handle => bool isRevealed) public revealed;

    function configure(uint256 fee_, bytes32 randomHandle_) external {
        fee = fee_;
        randomHandle = randomHandle_;
    }

    function setVerifier(address verifier_) external {
        verifier = verifier_;
    }

    function setShouldRevertRandom(bool shouldRevertRandom_) external {
        shouldRevertRandom = shouldRevertRandom_;
    }

    function getFee() external view returns (uint256) {
        return fee;
    }

    function asEuint256(uint256 value) external pure returns (euint256) {
        return euint256.wrap(bytes32(value));
    }

    function eRandBounded(bytes32 upperBound, ETypes randomType) external payable returns (bytes32) {
        require(!shouldRevertRandom, "random failed");
        require(msg.value == fee, "wrong fee");
        require(upperBound == bytes32(uint256(10_000)), "wrong bound");
        require(randomType == ETypes.Uint256, "wrong type");
        _transientAllowances[randomHandle][msg.sender] = true;
        return randomHandle;
    }

    function allow(bytes32 handle, address account) external {
        require(
            _transientAllowances[handle][msg.sender] || _persistentAllowances[handle][msg.sender], "sender not allowed"
        );
        _persistentAllowances[handle][account] = true;
    }

    function reveal(bytes32 handle) external {
        require(
            _transientAllowances[handle][msg.sender] || _persistentAllowances[handle][msg.sender], "sender not allowed"
        );
        revealed[handle] = true;
    }

    function incoVerifier() external view returns (address) {
        return verifier;
    }

    function persistAllowed(bytes32 handle, address account) external view returns (bool) {
        return _persistentAllowances[handle][account];
    }

    function isAllowed(bytes32 handle, address account) external view returns (bool) {
        return _transientAllowances[handle][account] || _persistentAllowances[handle][account];
    }
}
