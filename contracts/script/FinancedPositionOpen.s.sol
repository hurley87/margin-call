// SPDX-License-Identifier: MIT
pragma solidity 0.8.29;

import {Script, console} from "forge-std/Script.sol";
import {StdAssertions} from "forge-std/StdAssertions.sol";

import {CreditPool} from "../src/CreditPool.sol";
import {ExecutionAdapter} from "../src/ExecutionAdapter.sol";
import {IOracleAdapter} from "../src/interfaces/IOracleAdapter.sol";
import {MarginCall} from "../src/MarginCall.sol";
import {V1Config} from "../src/V1Config.sol";
import {BaseV1Constants} from "../test/fixtures/BaseV1Constants.sol";
import {MockNvdaC, MockOracleAdapter, MockSwapRouter, MockUsdc} from "../test/margincall/PositionNftTestDoubles.sol";

/// @title FinancedPositionOpen
/// @notice Local-Anvil-only harness: ordinary EOA opens a financed Position NFT through production adapters.
/// @dev Requires `MARGIN_CALL_PRIVATE_KEY`. Never logs or hardcodes that key. Anvil-only (`31337`).
contract FinancedPositionOpen is Script, StdAssertions {
    uint256 internal constant ANVIL_CHAIN_ID = 31337;
    uint256 internal constant DEFAULT_STOCK_AMOUNT = 1e8;
    uint256 internal constant DEFAULT_LEVERAGE = V1Config.LEVERAGE_1_25X;
    uint256 internal constant CREDIT_SEED = 1_000_000e6;

    error LocalAnvilOnly(uint256 actualChainId, uint256 requiredChainId);
    error ZeroStockAmount();
    error UnsupportedHarnessLeverage(uint256 leverage);

    struct RunState {
        address signer;
        MockNvdaC nvdac;
        MockUsdc usdc;
        MockOracleAdapter oracle;
        MockSwapRouter router;
        ExecutionAdapter execution;
        CreditPool pool;
        MarginCall marginCall;
        uint256 stockAmount;
        uint256 leverage;
        uint256 tokenId;
    }

    function run() external {
        if (block.chainid != ANVIL_CHAIN_ID) {
            revert LocalAnvilOnly(block.chainid, ANVIL_CHAIN_ID);
        }

        uint256 privateKey = vm.envUint("MARGIN_CALL_PRIVATE_KEY");
        RunState memory state;
        state.signer = vm.addr(privateKey);
        state.stockAmount = vm.envOr("MARGIN_CALL_STOCK_AMOUNT", DEFAULT_STOCK_AMOUNT);
        state.leverage = vm.envOr("MARGIN_CALL_LEVERAGE_BPS", DEFAULT_LEVERAGE);
        if (state.stockAmount == 0) {
            revert ZeroStockAmount();
        }
        if (
            state.leverage != V1Config.LEVERAGE_1_1X && state.leverage != V1Config.LEVERAGE_1_25X
                && state.leverage != V1Config.LEVERAGE_1_4X && state.leverage != V1Config.LEVERAGE_1_5X
        ) {
            revert UnsupportedHarnessLeverage(state.leverage);
        }

        console.log("=== LOCAL ONLY: financed Position NFT signer smoke test ===");
        console.log("chainId", block.chainid);
        console.log("signer", state.signer);
        console.log("stockAmount (raw NVDAc units)", state.stockAmount);
        console.log("targetLeverage bps", state.leverage);
        console.log("Broadcast artifact: broadcast/FinancedPositionOpen.s.sol/31337/run-latest.json");

        vm.startBroadcast(privateKey);

        state.nvdac = new MockNvdaC();
        state.usdc = new MockUsdc();
        state.oracle = new MockOracleAdapter();
        state.router = new MockSwapRouter(state.usdc, state.nvdac);
        state.execution = new ExecutionAdapter(
            address(state.usdc), address(state.nvdac), address(state.router), BaseV1Constants.UNISWAP_FEE
        );
        state.marginCall =
            new MarginCall(address(state.nvdac), address(state.usdc), address(state.oracle), address(state.execution));
        state.pool = new CreditPool(address(state.usdc), address(state.marginCall));
        state.marginCall.setCreditPool(address(state.pool));

        state.oracle.setObservation(IOracleAdapter.State.LIVE, BaseV1Constants.PINNED_FEED_ANSWER, 1, block.timestamp);
        state.router.setLivePrice(BaseV1Constants.PINNED_FEED_ANSWER);
        state.usdc.mint(address(state.pool), CREDIT_SEED);
        state.nvdac.mint(state.signer, state.stockAmount);
        state.nvdac.approve(address(state.marginCall), state.stockAmount);

        uint256 poolBefore = state.pool.availableCredit();
        console.log("--- tx: openPosition (financed) ---");
        state.tokenId = state.marginCall.openPosition(state.stockAmount, state.leverage, 0);

        vm.stopBroadcast();

        _inspect(state, poolBefore);
        console.log("=== PASS: fund pool -> approve -> financed open -> inspect ===");
    }

    function _inspect(RunState memory state, uint256 poolBefore) internal view {
        address owner = state.marginCall.ownerOf(state.tokenId);
        (uint256 stock, uint256 principal, uint256 accrued, uint256 lastAccrued, address executor) =
            state.marginCall.positions(state.tokenId);
        uint256 debt = state.marginCall.currentDebt(state.tokenId);
        uint256 custody = state.nvdac.balanceOf(address(state.marginCall));
        uint256 poolAfter = state.pool.availableCredit();

        console.log("--- inspect after financed open ---");
        console.log("tokenId", state.tokenId);
        console.log("ownerOf", owner);
        console.log("contributed stock", state.stockAmount);
        console.log("recorded stockAmount", stock);
        console.log("purchased stock (recorded - contributed)", stock - state.stockAmount);
        console.log("principal (borrowed USDC raw)", principal);
        console.log("accruedInterest", accrued);
        console.log("lastAccruedAt", lastAccrued);
        console.log("executor", executor);
        console.log("currentDebt", debt);
        console.log("CreditPool USDC before", poolBefore);
        console.log("CreditPool USDC after", poolAfter);
        console.log("MarginCall NVDAc custody", custody);
        console.log("signer NVDAc balance", state.nvdac.balanceOf(state.signer));
        console.log("MarginCall residual USDC", state.usdc.balanceOf(address(state.marginCall)));

        assertEq(owner, state.signer, "ownerOf");
        assertGt(stock, state.stockAmount, "bought additional NVDAc");
        assertGt(principal, 0, "principal drawn");
        assertEq(debt, principal, "debt equals principal at open");
        assertEq(poolAfter, poolBefore - principal, "pool decremented by principal");
        assertEq(custody, stock, "custody matches recorded stock");
        assertEq(state.nvdac.balanceOf(state.signer), 0, "signer depleted contribution");
        assertEq(state.usdc.balanceOf(address(state.marginCall)), 0, "no free USDC left on MarginCall");
    }
}
