// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Create2} from "@openzeppelin/contracts/utils/Create2.sol";
import {IERC6551Registry} from "../../src/interfaces/IERC6551.sol";

/// @notice Local stand-in for the canonical ERC-6551 registry.
/// @dev Reproduces the canonical proxy bytecode layout exactly — ERC-1167
///      header, implementation, footer, then salt/chainId/tokenContract/tokenId
///      appended as four words — so an account's `token()` decodes the same
///      here as it does against the real registry. Tests that rely on that
///      layout would silently pass against a looser double.
contract MockERC6551Registry is IERC6551Registry {
    function createAccount(
        address implementation,
        bytes32 salt,
        uint256 chainId,
        address tokenContract,
        uint256 tokenId
    ) external returns (address) {
        bytes memory creationCode = _creationCode(implementation, salt, chainId, tokenContract, tokenId);
        address computed = Create2.computeAddress(salt, keccak256(creationCode), address(this));

        if (computed.code.length != 0) {
            return computed;
        }

        address deployed = Create2.deploy(0, salt, creationCode);
        if (deployed != computed) {
            revert AccountCreationFailed();
        }

        emit ERC6551AccountCreated(deployed, implementation, salt, chainId, tokenContract, tokenId);
        return deployed;
    }

    function account(address implementation, bytes32 salt, uint256 chainId, address tokenContract, uint256 tokenId)
        external
        view
        returns (address)
    {
        bytes memory creationCode = _creationCode(implementation, salt, chainId, tokenContract, tokenId);
        return Create2.computeAddress(salt, keccak256(creationCode), address(this));
    }

    function _creationCode(
        address implementation,
        bytes32 salt,
        uint256 chainId,
        address tokenContract,
        uint256 tokenId
    ) internal pure returns (bytes memory) {
        return abi.encodePacked(
            hex"3d60ad80600a3d3981f3363d3d373d3d3d363d73",
            implementation,
            hex"5af43d82803e903d91602b57fd5bf3",
            abi.encode(salt, chainId, tokenContract, tokenId)
        );
    }
}
