// SPDX-License-Identifier: MIT
pragma solidity 0.8.29;

import {Script} from "forge-std/Script.sol";
import {StdAssertions} from "forge-std/StdAssertions.sol";
import {IERC721Errors} from "@openzeppelin/contracts/interfaces/draft-IERC6093.sol";

import {MarginCall} from "../src/MarginCall.sol";

/// @title HarnessBase
/// @notice Chain-agnostic scaffolding shared by every signer harness, local or mainnet.
/// @dev Holds only what is identical regardless of chain: the chain pin and the post-close burn assertion.
///      Each subclass supplies the chain id it pins and owns its own deployment and broadcast steps.
abstract contract HarnessBase is Script, StdAssertions {
    error ZeroStockAmount();
    error NftStillExists(uint256 tokenId, address owner);
    error UnexpectedOwnerOfRevert(uint256 tokenId, bytes data);

    /// @dev Assert the NFT is burned, and that `ownerOf` fails with exactly the ERC-721 nonexistent-token error
    ///      rather than any revert.
    function _assertTokenDoesNotExist(MarginCall marginCall, uint256 tokenId) internal view {
        bytes memory expected = abi.encodeWithSelector(IERC721Errors.ERC721NonexistentToken.selector, tokenId);
        (bool success, bytes memory data) =
            address(marginCall).staticcall(abi.encodeCall(marginCall.ownerOf, (tokenId)));
        if (success) {
            revert NftStillExists(tokenId, abi.decode(data, (address)));
        }
        if (keccak256(data) != keccak256(expected)) {
            revert UnexpectedOwnerOfRevert(tokenId, data);
        }
    }
}
