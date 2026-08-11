// SPDX-License-Identifier: MIT
pragma solidity 0.8.29;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice The testnet-only settlement token for Margin Call Crash.
/// @dev Its initial bankroll is minted at deployment. Once the faucet is configured,
///      only that faucet can create additional supply.
contract DeskDollars is ERC20 {
    uint8 public constant DECIMALS = 6;
    uint256 public constant INITIAL_BANKROLL_SEED = 25_000 * 10 ** DECIMALS;

    error ZeroSeedRecipient();
    error UnauthorizedFaucetConfigurer(address caller);
    error FaucetAlreadyConfigured();
    error ZeroFaucet();
    error NotFaucet(address caller);

    event FaucetConfigured(address indexed faucet);

    address public immutable faucetConfigurer;
    address public faucet;

    /// @param seedRecipient Recipient of the deployment-only 25,000 tUSD bankroll seed.
    constructor(address seedRecipient) ERC20("Desk Dollars", "tUSD") {
        if (seedRecipient == address(0)) revert ZeroSeedRecipient();

        faucetConfigurer = msg.sender;
        _mint(seedRecipient, INITIAL_BANKROLL_SEED);
    }

    function decimals() public pure override returns (uint8) {
        return DECIMALS;
    }

    /// @notice Completes the one-time deployment handoff to the rate-limited faucet.
    /// @dev This authority can configure a faucet once, but never mint tokens itself.
    function configureFaucet(address faucet_) external {
        if (msg.sender != faucetConfigurer) revert UnauthorizedFaucetConfigurer(msg.sender);
        if (faucet != address(0)) revert FaucetAlreadyConfigured();
        if (faucet_ == address(0)) revert ZeroFaucet();

        faucet = faucet_;
        emit FaucetConfigured(faucet_);
    }

    /// @notice Mints faucet tokens. No other post-deployment mint entry point exists.
    function mintFromFaucet(address recipient, uint256 amount) external {
        if (msg.sender != faucet) revert NotFaucet(msg.sender);

        _mint(recipient, amount);
    }
}
