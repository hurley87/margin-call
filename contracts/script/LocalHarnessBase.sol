// SPDX-License-Identifier: MIT
pragma solidity 0.8.29;

import {Script} from "forge-std/Script.sol";
import {StdAssertions} from "forge-std/StdAssertions.sol";
import {IERC721Errors} from "@openzeppelin/contracts/interfaces/draft-IERC6093.sol";

import {MarginCall} from "../src/MarginCall.sol";

/// @title LocalHarnessBase
/// @notice Shared scaffolding for the local-Anvil-only signer smoke harnesses.
/// @dev Holds only what every harness needs: the chain guard and the post-close burn assertion. Each harness owns
///      its own deployment, broadcast steps, and inspection output.
abstract contract LocalHarnessBase is Script, StdAssertions {
    uint256 internal constant ANVIL_CHAIN_ID = 31337;
    uint256 internal constant DEFAULT_STOCK_AMOUNT = 1e8;

    error LocalAnvilOnly(uint256 actualChainId, uint256 requiredChainId);
    error ZeroStockAmount();
    error NftStillExists(uint256 tokenId, address owner);
    error UnexpectedOwnerOfRevert(uint256 tokenId, bytes data);

    /// @dev Refuse to run anywhere but local Anvil. These harnesses deploy mocks and seed credit.
    function _requireLocalAnvil() internal view {
        if (block.chainid != ANVIL_CHAIN_ID) {
            revert LocalAnvilOnly(block.chainid, ANVIL_CHAIN_ID);
        }
    }

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
