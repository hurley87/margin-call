// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {IERC721Receiver} from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import {IERC1271} from "@openzeppelin/contracts/interfaces/IERC1271.sol";
import {SignatureChecker} from "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";
import {IERC6551Account, IERC6551Executable} from "./interfaces/IERC6551.sol";

/// @notice ERC-6551 token bound account implementation for Trader identities.
/// @dev Deployed once and used as the implementation behind every Trader's
///      account proxy, which the canonical ERC-6551 registry creates. Because a
///      cross-chain implementation address cannot be assumed to hold code, this
///      is deployed and verified per network rather than reused by address.
///
///      Authority is read live from the controlling NFT on every call, so
///      control follows a standard ERC-721 transfer with no migration step and
///      no residual power for the previous owner. There is no admin, no
///      upgrade path, and no House key: only the current NFT owner can move
///      what the account holds.
contract TraderAccount is IERC165, IERC1271, IERC6551Account, IERC6551Executable, IERC721Receiver {
    /// @dev Offset of the token data appended to the proxy's runtime code:
    ///      ERC-1167 header (10) + implementation (20) + footer (15) + salt (32).
    uint256 private constant TOKEN_DATA_OFFSET = 0x4d;
    uint256 private constant TOKEN_DATA_LENGTH = 0x60;

    /// @dev Runtime size of a registry-created proxy: the 0x4d bytes preceding
    ///      the token data plus chainId, tokenContract, and tokenId.
    uint256 private constant PROXY_RUNTIME_LENGTH = 0xad;

    uint256 public state;

    event TransactionExecuted(address indexed to, uint256 value, bytes data, uint256 state);

    receive() external payable {}

    /// @notice Execute a call from the account.
    /// @dev Restricted to the current NFT owner. Delegated agent keys never get
    ///      raw account control; they authorize typed protocol intents instead,
    ///      so a compromised agent key cannot drain the account.
    function execute(address to, uint256 value, bytes calldata data, uint8 operation)
        external
        payable
        returns (bytes memory result)
    {
        require(_isValidSigner(msg.sender), "Not trader owner");
        require(operation == 0, "Unsupported operation");

        ++state;

        bool success;
        (success, result) = to.call{value: value}(data);
        if (!success) {
            assembly {
                revert(add(result, 0x20), mload(result))
            }
        }

        emit TransactionExecuted(to, value, data, state);
    }

    /// @notice Identity of the NFT that controls this account.
    /// @dev Read from the proxy's own runtime code. Anything that is not a
    ///      registry-created proxy — the bare implementation most of all —
    ///      reports no binding rather than reverting or decoding whatever
    ///      happens to sit at that offset. Callers get an ownerless account,
    ///      which denies every authority check.
    function token() public view returns (uint256 chainId, address tokenContract, uint256 tokenId) {
        if (address(this).code.length != PROXY_RUNTIME_LENGTH) {
            return (0, address(0), 0);
        }

        bytes memory footer = new bytes(TOKEN_DATA_LENGTH);
        assembly {
            extcodecopy(address(), add(footer, 0x20), TOKEN_DATA_OFFSET, TOKEN_DATA_LENGTH)
        }
        return abi.decode(footer, (uint256, address, uint256));
    }

    /// @notice Current controller of the account, or zero when it has none.
    function owner() public view returns (address) {
        (uint256 chainId, address tokenContract, uint256 tokenId) = token();
        // A Trader bound on another chain has no owner here. Failing closed
        // matters: a zero owner must never be treated as a valid signer.
        if (chainId != block.chainid || tokenContract == address(0)) {
            return address(0);
        }
        return IERC721(tokenContract).ownerOf(tokenId);
    }

    function isValidSigner(address signer, bytes calldata) external view returns (bytes4) {
        if (_isValidSigner(signer)) {
            return IERC6551Account.isValidSigner.selector;
        }
        return bytes4(0);
    }

    /// @notice ERC-1271 validation against the current NFT owner.
    /// @dev Because the owner is resolved live, a signature from a previous
    ///      owner stops validating the moment the Trader is transferred.
    function isValidSignature(bytes32 hash, bytes memory signature) external view returns (bytes4) {
        address currentOwner = owner();
        if (currentOwner == address(0)) {
            return bytes4(0);
        }
        if (SignatureChecker.isValidSignatureNow(currentOwner, hash, signature)) {
            return IERC1271.isValidSignature.selector;
        }
        return bytes4(0);
    }

    /// @dev Accepts Lots and other ERC-721s, but refuses the account's own
    ///      controlling token: letting an account own itself would strand it
    ///      with no reachable owner.
    function onERC721Received(address, address, uint256 receivedTokenId, bytes memory) external view returns (bytes4) {
        (uint256 chainId, address tokenContract, uint256 tokenId) = token();
        if (chainId == block.chainid && tokenContract == msg.sender && tokenId == receivedTokenId) {
            revert("Ownership cycle");
        }
        return IERC721Receiver.onERC721Received.selector;
    }

    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        return interfaceId == type(IERC165).interfaceId || interfaceId == type(IERC6551Account).interfaceId
            || interfaceId == type(IERC6551Executable).interfaceId || interfaceId == type(IERC1271).interfaceId
            || interfaceId == type(IERC721Receiver).interfaceId;
    }

    function _isValidSigner(address signer) internal view returns (bool) {
        address currentOwner = owner();
        return currentOwner != address(0) && signer == currentOwner;
    }
}
