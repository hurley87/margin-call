// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @notice ERC-6551 token bound account registry.
/// @dev The canonical registry is deployed at a fixed CREATE2 address on every
///      supported chain. Its presence on Robinhood Chain testnet was verified
///      in issue #248; see contracts/deployments/robinhood-testnet.dependencies.json.
interface IERC6551Registry {
    event ERC6551AccountCreated(
        address account,
        address indexed implementation,
        bytes32 salt,
        uint256 chainId,
        address indexed tokenContract,
        uint256 indexed tokenId
    );

    error AccountCreationFailed();

    function createAccount(
        address implementation,
        bytes32 salt,
        uint256 chainId,
        address tokenContract,
        uint256 tokenId
    ) external returns (address account);

    function account(address implementation, bytes32 salt, uint256 chainId, address tokenContract, uint256 tokenId)
        external
        view
        returns (address account);
}

/// @notice ERC-6551 token bound account.
interface IERC6551Account {
    receive() external payable;

    /// @notice Identity of the NFT that controls this account.
    function token() external view returns (uint256 chainId, address tokenContract, uint256 tokenId);

    /// @notice Monotonic counter that changes whenever account state changes.
    function state() external view returns (uint256);

    /// @return magicValue `IERC6551Account.isValidSigner.selector` when valid.
    function isValidSigner(address signer, bytes calldata context) external view returns (bytes4 magicValue);
}

/// @notice ERC-6551 execution interface.
interface IERC6551Executable {
    /// @param operation Only `0` (CALL) is required by the standard.
    function execute(address to, uint256 value, bytes calldata data, uint8 operation)
        external
        payable
        returns (bytes memory);
}
