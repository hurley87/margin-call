// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract MockIdentityRegistry {
    mapping(uint256 => address) private _owners;
    uint256 private _nextTokenId = 1;

    function setOwner(uint256 tokenId, address owner) external {
        _owners[tokenId] = owner;
    }

    function ownerOf(uint256 tokenId) external view returns (address) {
        address o = _owners[tokenId];
        require(o != address(0), "Token does not exist");
        return o;
    }

    /// @dev Simulate server-side minting: mint to msg.sender
    function register() external returns (uint256 tokenId) {
        tokenId = _nextTokenId++;
        _owners[tokenId] = msg.sender;
    }
}
