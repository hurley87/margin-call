// SPDX-License-Identifier: MIT
pragma solidity 0.8.29;

import {DecryptionAttestation} from "@inco/lightning/src/lightning-parts/DecryptionAttester.types.sol";

/// @dev Shared attestation verifier mock: valid by default, optionally strict
///      about the exact handle/value pair or forced invalid.
contract IncoVerifierMock {
    bool public validAttestation = true;
    bytes32 public expectedHandle;
    uint256 public expectedValue;
    bool public enforceExpected;

    function setValidAttestation(bool validAttestation_) external {
        validAttestation = validAttestation_;
    }

    function setExpectedAttestation(bytes32 handle, uint256 value) external {
        expectedHandle = handle;
        expectedValue = value;
        enforceExpected = true;
    }

    function isValidDecryptionAttestation(DecryptionAttestation memory decryption, bytes[] calldata)
        external
        view
        returns (bool)
    {
        if (!validAttestation) return false;
        if (!enforceExpected) return true;
        return decryption.handle == expectedHandle && uint256(decryption.value) == expectedValue;
    }
}
