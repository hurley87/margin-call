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
/// @notice Local-Anvil-only harness: ordinary EOA opens, accrues, repays, and closes a financed Position NFT.
/// @dev Requires `MARGIN_CALL_PRIVATE_KEY`. Never logs or hardcodes that key. Anvil-only (`31337`).
contract FinancedPositionOpen is Script, StdAssertions {
    uint256 internal constant ANVIL_CHAIN_ID = 31337;
    uint256 internal constant DEFAULT_STOCK_AMOUNT = 1e8;
    uint256 internal constant DEFAULT_LEVERAGE = V1Config.LEVERAGE_1_25X;
    uint256 internal constant CREDIT_SEED = 1_000_000e6;
    uint256 internal constant ACCRUAL_WINDOW = 30 days;

    error LocalAnvilOnly(uint256 actualChainId, uint256 requiredChainId);
    error ZeroStockAmount();
    error UnsupportedHarnessLeverage(uint256 leverage);

    /// @dev Shared across open / accrue / repay / close inspect steps.
    struct RunState {
        address signer;
        MockNvdaC nvdac;
        MockUsdc usdc;
        CreditPool pool;
        MarginCall marginCall;
        uint256 stockAmount;
        uint256 tokenId;
        uint256 principalAtOpen;
        uint256 stockAtOpen;
    }

    function run() external {
        if (block.chainid != ANVIL_CHAIN_ID) {
            revert LocalAnvilOnly(block.chainid, ANVIL_CHAIN_ID);
        }

        uint256 privateKey = vm.envUint("MARGIN_CALL_PRIVATE_KEY");
        RunState memory state;
        state.signer = vm.addr(privateKey);
        state.stockAmount = vm.envOr("MARGIN_CALL_STOCK_AMOUNT", DEFAULT_STOCK_AMOUNT);
        uint256 leverage = vm.envOr("MARGIN_CALL_LEVERAGE_BPS", DEFAULT_LEVERAGE);
        if (state.stockAmount == 0) {
            revert ZeroStockAmount();
        }
        // Checked here, before `startBroadcast`, so an unusable preset fails before anything is deployed.
        if (!V1Config.isFinancedLeverage(leverage)) {
            revert UnsupportedHarnessLeverage(leverage);
        }

        console.log("=== LOCAL ONLY: financed Position NFT debt lifecycle smoke test ===");
        console.log("chainId", block.chainid);
        console.log("signer", state.signer);
        console.log("stockAmount (raw NVDAc units)", state.stockAmount);
        console.log("targetLeverage bps", leverage);
        console.log("accrual window (seconds)", ACCRUAL_WINDOW);
        console.log("Broadcast artifact: broadcast/FinancedPositionOpen.s.sol/31337/run-latest.json");

        vm.startBroadcast(privateKey);

        state.nvdac = new MockNvdaC();
        state.usdc = new MockUsdc();
        MockOracleAdapter oracle = new MockOracleAdapter();
        MockSwapRouter router = new MockSwapRouter(state.usdc, state.nvdac);
        ExecutionAdapter execution = new ExecutionAdapter(
            address(state.usdc), address(state.nvdac), address(router), BaseV1Constants.UNISWAP_FEE
        );
        state.marginCall =
            new MarginCall(address(state.nvdac), address(state.usdc), address(oracle), address(execution));
        state.pool = new CreditPool(address(state.usdc), address(state.marginCall));
        state.marginCall.setCreditPool(address(state.pool));

        oracle.setObservation(IOracleAdapter.State.LIVE, BaseV1Constants.PINNED_FEED_ANSWER, 1, block.timestamp);
        router.setLivePrice(BaseV1Constants.PINNED_FEED_ANSWER);
        state.usdc.mint(address(state.pool), CREDIT_SEED);
        state.nvdac.mint(state.signer, state.stockAmount);
        state.nvdac.approve(address(state.marginCall), state.stockAmount);

        uint256 poolBeforeOpen = state.pool.availableCredit();
        console.log("--- tx: openPosition (financed) ---");
        state.tokenId = state.marginCall.openPosition(state.stockAmount, leverage, 0);

        (state.stockAtOpen, state.principalAtOpen,,,) = state.marginCall.positions(state.tokenId);
        uint256 debtAtOpen = state.marginCall.currentDebt(state.tokenId);
        assertEq(debtAtOpen, state.principalAtOpen, "debt equals principal at open");
        assertEq(state.pool.availableCredit(), poolBeforeOpen - state.principalAtOpen, "pool decremented");

        vm.stopBroadcast();

        _inspectAfterOpen(state, poolBeforeOpen);

        // Advance time so lazy interest is visible without a keeper transaction. Forge forwards `warp` to Anvil
        // under `--broadcast`, so the next on-chain txs and eth_calls see the new timestamp.
        console.log("--- cheat: advance time ---");
        uint256 accruedAt = block.timestamp + ACCRUAL_WINDOW;
        vm.warp(accruedAt);

        uint256 debtAfterAccrual = state.marginCall.currentDebt(state.tokenId);
        console.log("currentDebt after accrual", debtAfterAccrual);
        assertGt(debtAfterAccrual, state.principalAtOpen, "debt must exceed principal after elapsed time");

        vm.startBroadcast(privateKey);

        // Oversized repay cap: contract must pull only currentDebt and leave the excess with the signer.
        uint256 repayCap = debtAfterAccrual + 1_000e6;
        state.usdc.mint(state.signer, repayCap);
        state.usdc.approve(address(state.marginCall), repayCap);

        uint256 poolBeforeRepay = state.pool.availableCredit();
        uint256 signerUsdcBefore = state.usdc.balanceOf(state.signer);
        console.log("--- tx: repay (oversized cap) ---");
        state.marginCall.repay(state.tokenId, repayCap);

        uint256 debtAfterRepay = state.marginCall.currentDebt(state.tokenId);
        assertEq(debtAfterRepay, 0, "debt cleared");
        assertEq(state.pool.availableCredit(), poolBeforeRepay + debtAfterAccrual, "pool restored by actual paid");
        assertEq(
            state.usdc.balanceOf(state.signer),
            signerUsdcBefore - debtAfterAccrual,
            "excess repay cap never left the signer"
        );
        assertEq(state.usdc.balanceOf(address(state.marginCall)), 0, "no residual USDC on MarginCall");

        console.log("--- tx: closePosition ---");
        state.marginCall.closePosition(state.tokenId);

        vm.stopBroadcast();

        _inspectAfterClose(state);
        console.log("=== PASS: open -> accrue -> repay -> close ===");
    }

    function _inspectAfterOpen(RunState memory state, uint256 poolBefore) internal view {
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

    function _inspectAfterClose(RunState memory state) internal view {
        console.log("--- inspect after repay + close ---");
        console.log("signer NVDAc balance", state.nvdac.balanceOf(state.signer));
        console.log("MarginCall NVDAc custody", state.nvdac.balanceOf(address(state.marginCall)));
        console.log("CreditPool USDC", state.pool.availableCredit());
        console.log("MarginCall residual USDC", state.usdc.balanceOf(address(state.marginCall)));

        assertEq(state.nvdac.balanceOf(state.signer), state.stockAtOpen, "stock returned to signer");
        assertEq(state.nvdac.balanceOf(address(state.marginCall)), 0, "custody cleared");
        assertEq(state.usdc.balanceOf(address(state.marginCall)), 0, "no residual USDC");

        (uint256 stock, uint256 principal, uint256 accrued, uint256 lastAccrued, address executor) =
            state.marginCall.positions(state.tokenId);
        assertEq(stock, 0);
        assertEq(principal, 0);
        assertEq(accrued, 0);
        assertEq(lastAccrued, 0);
        assertEq(executor, address(0));

        // NFT must be burned.
        try state.marginCall.ownerOf(state.tokenId) returns (address) {
            revert("token still exists after close");
        } catch {}
    }
}
