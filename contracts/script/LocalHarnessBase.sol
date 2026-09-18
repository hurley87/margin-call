// SPDX-License-Identifier: MIT
pragma solidity 0.8.29;

import {CreditPool} from "../src/CreditPool.sol";
import {ExecutionAdapter} from "../src/ExecutionAdapter.sol";
import {IOracleAdapter} from "../src/interfaces/IOracleAdapter.sol";
import {MarginCall} from "../src/MarginCall.sol";
import {BaseV1Constants} from "../test/fixtures/BaseV1Constants.sol";
import {MockNvdaC, MockOracleAdapter, MockSwapRouter, MockUsdc} from "../test/margincall/PositionNftTestDoubles.sol";
import {HarnessBase} from "./HarnessBase.sol";

/// @title LocalHarnessBase
/// @notice Shared scaffolding for the local-Anvil-only signer smoke harnesses.
/// @dev Adds the Anvil chain pin to `HarnessBase`, which owns the burn assertion. Owns the shared mock
///      stack deploy so financed and spot harnesses cannot wire `addAsset` differently.
abstract contract LocalHarnessBase is HarnessBase {
    uint256 internal constant ANVIL_CHAIN_ID = 31337;
    uint256 internal constant DEFAULT_STOCK_AMOUNT = 1e8;

    error LocalAnvilOnly(uint256 actualChainId, uint256 requiredChainId);

    /// @dev Refuse to run anywhere but local Anvil. These harnesses deploy mocks and seed credit.
    function _requireLocalAnvil() internal view {
        if (block.chainid != ANVIL_CHAIN_ID) {
            revert LocalAnvilOnly(block.chainid, ANVIL_CHAIN_ID);
        }
    }

    /// @dev One definition of the local mock stack: mock stock + USDC + oracle + router + adapters +
    ///      MarginCall + CreditPool + single asset registration. Spot passes `routerShouldRevert = true`.
    function _deployMockStack(address admin, bool routerShouldRevert)
        internal
        returns (
            MockNvdaC nvdac,
            MockUsdc usdc,
            MockOracleAdapter oracle,
            MockSwapRouter router,
            MarginCall marginCall,
            CreditPool pool,
            uint256 assetId
        )
    {
        nvdac = new MockNvdaC();
        usdc = new MockUsdc();
        oracle = new MockOracleAdapter(address(nvdac));
        router = new MockSwapRouter(usdc, address(nvdac));
        if (routerShouldRevert) {
            router.setShouldRevert(true);
        }
        ExecutionAdapter execution =
            new ExecutionAdapter(address(usdc), address(nvdac), address(router), BaseV1Constants.UNISWAP_FEE);
        marginCall = new MarginCall(address(usdc), admin);
        pool = new CreditPool(address(usdc), address(marginCall), admin);
        marginCall.setCreditPool(address(pool));
        assetId = marginCall.addAsset(address(nvdac), address(oracle), address(execution));
        oracle.setObservation(IOracleAdapter.State.LIVE, BaseV1Constants.PINNED_FEED_ANSWER, 1, block.timestamp);
        if (!routerShouldRevert) {
            router.setLivePrice(BaseV1Constants.PINNED_FEED_ANSWER);
        }
    }
}
