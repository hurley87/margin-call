// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

/// @title MockUSD
/// @notice Protocol-deployed mock USD stablecoin for Robinhood Chain testnet.
/// @dev Visibly labelled as a valueless test asset. Mintable only by MINTER_ROLE
///      (Desk Grants and refills). Decimals match USDG (6) so mainnet is a fresh
///      config rather than a decimals migration. Nothing about this token carries
///      over to a mainnet deployment.
contract MockUSD is ERC20, AccessControl {
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");

    /// @notice Always true — on-chain disclosure that this is a test asset.
    bool public constant IS_TEST_ASSET = true;

    /// @notice Human-readable disclosure of valueless test status.
    string public constant TEST_ASSET_NOTICE =
        "VALUELESS TEST ASSET - no real USD backing; for Margin Call Season testnet only";

    /// @param admin Address granted DEFAULT_ADMIN_ROLE (can grant/revoke MINTER_ROLE).
    constructor(address admin) ERC20("Margin Call Mock USD (Test Asset)", "MOCKUSD") {
        require(admin != address(0), "MockUSD: zero admin");
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
    }

    /// @inheritdoc ERC20
    function decimals() public pure override returns (uint8) {
        return 6;
    }

    /// @notice Mint tokens. Restricted to MINTER_ROLE.
    /// @param to Recipient of newly minted tokens.
    /// @param amount Amount in 6-decimal units.
    function mint(address to, uint256 amount) external onlyRole(MINTER_ROLE) {
        _mint(to, amount);
    }
}
