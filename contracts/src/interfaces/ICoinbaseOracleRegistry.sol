// SPDX-License-Identifier: MIT
pragma solidity 0.8.29;

/// @notice Minimal Coinbase oracle-registry reader used by `OracleAdapter`.
interface ICoinbaseOracleRegistry {
    function getOracleParams(address token) external view returns (uint256 multiplier, bool paused);
}
