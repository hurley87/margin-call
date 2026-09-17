// SPDX-License-Identifier: MIT
pragma solidity 0.8.29;

import {console} from "forge-std/Script.sol";

import {CreditPool} from "../src/CreditPool.sol";
import {ExecutionAdapter} from "../src/ExecutionAdapter.sol";
import {IOracleAdapter} from "../src/interfaces/IOracleAdapter.sol";
import {MarginCall} from "../src/MarginCall.sol";
import {V1Config} from "../src/V1Config.sol";
import {BaseV1Constants} from "../test/fixtures/BaseV1Constants.sol";
import {MockNvdaC, MockOracleAdapter, MockSwapRouter, MockUsdc} from "../test/margincall/PositionNftTestDoubles.sol";
import {LocalHarnessBase} from "./LocalHarnessBase.sol";

/// @title FinancedExecutorTransfer
/// @notice Local-Anvil-only A → E → B harness: open financed, appoint executor, E repays, A transfers to B.
/// @dev Requires three disposable Anvil keys. Never logs or hardcodes them. Anvil-only (`31337`).
///
///      Run through `run-executor-transfer-local.sh`, which advances the node clock between open and the
///      executor/transfer phase. `forge script --broadcast` cannot `vm.warp` the live node.
contract FinancedExecutorTransfer is LocalHarnessBase {
    uint256 internal constant DEFAULT_LEVERAGE = V1Config.LEVERAGE_1_25X;
    uint256 internal constant CREDIT_SEED = 1_000_000e6;
    /// @dev Partial repay size as a fraction of current debt (bps). 2500 = 25%.
    uint256 internal constant PARTIAL_REPAY_BPS = 2_500;

    string internal constant STATE_PATH = "./deployments/executor-transfer-local.run.json";

    error UnsupportedHarnessLeverage(uint256 leverage);
    error NoAccrualOnNode(uint256 debt, uint256 principalAtOpen);
    error UnexpectedExecutor(address actual, address expected);
    error UnexpectedOwner(address actual, address expected);
    error AuthorityStillHeld(string role);
    error DebtNotCleared(uint256 remaining);

    struct HarnessState {
        address alice;
        address executor;
        address bob;
        MockNvdaC nvdac;
        MockUsdc usdc;
        CreditPool pool;
        MarginCall marginCall;
        uint256 tokenId;
        uint256 contributedStock;
        uint256 stockAtOpen;
        uint256 principalAtOpen;
        uint256 openedAt;
        // Snapshot after E's partial repay and before the A→B transfer.
        uint256 stockBeforeTransfer;
        uint256 principalBeforeTransfer;
        uint256 accruedBeforeTransfer;
        uint256 lastAccruedBeforeTransfer;
        uint256 debtBeforeTransfer;
    }

    // Phase 1 - deploy the stack and open a financed position as A.
    function deployAndOpen() external {
        _requireLocalAnvil();

        uint256 aliceKey = vm.envUint("MARGIN_CALL_PRIVATE_KEY");
        uint256 contributedStock = vm.envOr("MARGIN_CALL_STOCK_AMOUNT", DEFAULT_STOCK_AMOUNT);
        uint256 leverage = vm.envOr("MARGIN_CALL_LEVERAGE_BPS", DEFAULT_LEVERAGE);
        if (contributedStock == 0) {
            revert ZeroStockAmount();
        }
        if (!V1Config.isFinancedLeverage(leverage)) {
            revert UnsupportedHarnessLeverage(leverage);
        }

        address alice = vm.addr(aliceKey);
        console.log("=== LOCAL ONLY: financed A -> E -> B executor transfer ===");
        console.log("phase 1/5: deploy + openPosition (financed)");
        console.log("chainId", block.chainid);
        console.log("alice", alice);
        console.log("executor", vm.addr(vm.envUint("MARGIN_CALL_EXECUTOR_KEY")));
        console.log("bob", vm.addr(vm.envUint("MARGIN_CALL_RECIPIENT_KEY")));
        console.log("stockAmount (raw NVDAc units)", contributedStock);
        console.log("targetLeverage bps", leverage);

        vm.startBroadcast(aliceKey);
        (MockNvdaC nvdac, MockUsdc usdc, MarginCall marginCall, CreditPool pool) = _deployStack();
        usdc.mint(address(pool), CREDIT_SEED);
        nvdac.mint(alice, contributedStock);
        nvdac.approve(address(marginCall), contributedStock);
        uint256 tokenId = marginCall.openPosition(contributedStock, leverage, 0);
        vm.stopBroadcast();

        _persistOpen(alice, nvdac, usdc, pool, marginCall, tokenId, contributedStock);
        console.log("tokenId", tokenId);
        console.log("state written to", STATE_PATH);
    }

    function _deployStack() private returns (MockNvdaC nvdac, MockUsdc usdc, MarginCall marginCall, CreditPool pool) {
        nvdac = new MockNvdaC();
        usdc = new MockUsdc();
        MockOracleAdapter oracle = new MockOracleAdapter();
        MockSwapRouter router = new MockSwapRouter(usdc, nvdac);
        ExecutionAdapter execution =
            new ExecutionAdapter(address(usdc), address(nvdac), address(router), BaseV1Constants.UNISWAP_FEE);
        marginCall = new MarginCall(address(nvdac), address(usdc), address(oracle), address(execution));
        pool = new CreditPool(address(usdc), address(marginCall));
        marginCall.setCreditPool(address(pool));
        oracle.setObservation(IOracleAdapter.State.LIVE, BaseV1Constants.PINNED_FEED_ANSWER, 1, block.timestamp);
        router.setLivePrice(BaseV1Constants.PINNED_FEED_ANSWER);
    }

    function _persistOpen(
        address alice,
        MockNvdaC nvdac,
        MockUsdc usdc,
        CreditPool pool,
        MarginCall marginCall,
        uint256 tokenId,
        uint256 contributedStock
    ) private {
        (uint256 stockAtOpen, uint256 principalAtOpen,,,) = marginCall.positions(tokenId);
        console.log("recorded stockAmount", stockAtOpen);
        console.log("principal (borrowed USDC raw)", principalAtOpen);
        _persist(
            HarnessState({
                alice: alice,
                executor: vm.addr(vm.envUint("MARGIN_CALL_EXECUTOR_KEY")),
                bob: vm.addr(vm.envUint("MARGIN_CALL_RECIPIENT_KEY")),
                nvdac: nvdac,
                usdc: usdc,
                pool: pool,
                marginCall: marginCall,
                tokenId: tokenId,
                contributedStock: contributedStock,
                stockAtOpen: stockAtOpen,
                principalAtOpen: principalAtOpen,
                openedAt: block.timestamp,
                stockBeforeTransfer: 0,
                principalBeforeTransfer: 0,
                accruedBeforeTransfer: 0,
                lastAccruedBeforeTransfer: 0,
                debtBeforeTransfer: 0
            })
        );
    }

    // Phase 2 - after the wrapper advances the node clock: A appoints E and E partial-repays.
    function appointAndRepay() external {
        _requireLocalAnvil();

        uint256 aliceKey = vm.envUint("MARGIN_CALL_PRIVATE_KEY");
        uint256 executorKey = vm.envUint("MARGIN_CALL_EXECUTOR_KEY");
        HarnessState memory state = _load();

        uint256 debt = state.marginCall.currentDebt(state.tokenId);
        console.log("phase 2/5: setExecutor + E partial repay");
        console.log("node seconds elapsed since open", block.timestamp - state.openedAt);
        console.log("principal at open", state.principalAtOpen);
        console.log("currentDebt read from node", debt);

        if (debt <= state.principalAtOpen) {
            revert NoAccrualOnNode(debt, state.principalAtOpen);
        }

        vm.startBroadcast(aliceKey);
        state.marginCall.setExecutor(state.tokenId, state.executor);
        vm.stopBroadcast();

        (,,,, address executorAfterSet) = state.marginCall.positions(state.tokenId);
        if (executorAfterSet != state.executor) {
            revert UnexpectedExecutor(executorAfterSet, state.executor);
        }

        uint256 partialPay = (debt * PARTIAL_REPAY_BPS) / V1Config.BPS_DENOMINATOR;
        if (partialPay == 0) {
            partialPay = 1;
        }

        vm.startBroadcast(executorKey);
        state.usdc.mint(state.executor, partialPay);
        state.usdc.approve(address(state.marginCall), partialPay);
        state.marginCall.repay(state.tokenId, partialPay);
        vm.stopBroadcast();

        console.log("partial repay (raw USDC)", partialPay);
        console.log("executor set to", state.executor);
    }

    // Phase 3 - separate broadcast: snapshot live post-repay accounting, then A transfers to B.
    // Must be its own forge-script invocation so the snapshot reads settled chain state, not the
    // prior script's local simulation of the repay.
    function transferToBob() external {
        _requireLocalAnvil();

        uint256 aliceKey = vm.envUint("MARGIN_CALL_PRIVATE_KEY");
        HarnessState memory state = _load();

        console.log("phase 3/5: snapshot live accounting and transfer to B");

        (
            uint256 stockBefore,
            uint256 principalBefore,
            uint256 accruedBefore,
            uint256 lastAccruedBefore,
            address executorBefore
        ) = state.marginCall.positions(state.tokenId);
        if (executorBefore != state.executor) {
            revert UnexpectedExecutor(executorBefore, state.executor);
        }
        uint256 debtBefore = state.marginCall.currentDebt(state.tokenId);

        state.stockBeforeTransfer = stockBefore;
        state.principalBeforeTransfer = principalBefore;
        state.accruedBeforeTransfer = accruedBefore;
        state.lastAccruedBeforeTransfer = lastAccruedBefore;
        state.debtBeforeTransfer = debtBefore;
        // Persist before broadcasting so a later verify phase still has the live snapshot even if
        // this script's post-broadcast simulation re-reads drifted local state.
        _persist(state);

        vm.startBroadcast(aliceKey);
        state.marginCall.safeTransferFrom(state.alice, state.bob, state.tokenId);
        vm.stopBroadcast();

        address ownerAfter = state.marginCall.ownerOf(state.tokenId);
        if (ownerAfter != state.bob) {
            revert UnexpectedOwner(ownerAfter, state.bob);
        }
        (
            uint256 stockAfter,
            uint256 principalAfter,
            uint256 accruedAfter,
            uint256 lastAccruedAfter,
            address executorAfter
        ) = state.marginCall.positions(state.tokenId);
        if (executorAfter != address(0)) {
            revert UnexpectedExecutor(executorAfter, address(0));
        }
        assertEq(stockAfter, stockBefore, "stock must survive transfer");
        assertEq(principalAfter, principalBefore, "principal must survive transfer");
        assertEq(accruedAfter, accruedBefore, "accrued must survive transfer");
        assertEq(lastAccruedAfter, lastAccruedBefore, "lastAccruedAt must survive transfer");
        assertEq(state.marginCall.currentDebt(state.tokenId), debtBefore, "debt timing unchanged");

        console.log("debt before transfer", debtBefore);
        console.log("owner after transfer", ownerAfter);
        console.log("executor after transfer", executorAfter);
    }

    // Phase 4 - simulation-only: prove A and E lose repay / setExecutor authority after the transfer.
    function proveAuthorityLost() external {
        _requireLocalAnvil();
        HarnessState memory state = _load();

        console.log("phase 4/5: prove A and E lost management authority");

        address owner = state.marginCall.ownerOf(state.tokenId);
        if (owner != state.bob) {
            revert UnexpectedOwner(owner, state.bob);
        }
        (,,,, address executor) = state.marginCall.positions(state.tokenId);
        if (executor != address(0)) {
            revert UnexpectedExecutor(executor, address(0));
        }

        uint256 probe = state.marginCall.currentDebt(state.tokenId);
        if (probe == 0) {
            probe = 1;
        }

        // Fund approvals in simulation only; these writes are not broadcast.
        state.usdc.mint(state.alice, probe);
        state.usdc.mint(state.executor, probe);
        vm.prank(state.alice);
        state.usdc.approve(address(state.marginCall), probe);
        vm.prank(state.executor);
        state.usdc.approve(address(state.marginCall), probe);

        vm.prank(state.alice);
        try state.marginCall.repay(state.tokenId, probe) {
            revert AuthorityStillHeld("alice-repay");
        } catch {}

        vm.prank(state.executor);
        try state.marginCall.repay(state.tokenId, probe) {
            revert AuthorityStillHeld("executor-repay");
        } catch {}

        vm.prank(state.alice);
        try state.marginCall.setExecutor(state.tokenId, state.alice) {
            revert AuthorityStillHeld("alice-setExecutor");
        } catch {}

        vm.prank(state.executor);
        try state.marginCall.setExecutor(state.tokenId, state.executor) {
            revert AuthorityStillHeld("executor-setExecutor");
        } catch {}

        console.log("A and E management calls revert as required");
    }

    // Phase 5 - B repays remaining debt on the live node, then read-only settle checks.
    function bobRepayAndVerify() external {
        _requireLocalAnvil();

        uint256 bobKey = vm.envUint("MARGIN_CALL_RECIPIENT_KEY");
        HarnessState memory state = _load();

        console.log("phase 5/5: B repays remaining debt and verify");

        address owner = state.marginCall.ownerOf(state.tokenId);
        if (owner != state.bob) {
            revert UnexpectedOwner(owner, state.bob);
        }

        (uint256 stock, uint256 principal, uint256 accrued, uint256 lastAccrued, address executor) =
            state.marginCall.positions(state.tokenId);
        assertEq(stock, state.stockBeforeTransfer, "stock must still match pre-transfer");
        assertEq(principal, state.principalBeforeTransfer, "principal must still match pre-transfer");
        assertEq(accrued, state.accruedBeforeTransfer, "accrued must still match pre-transfer");
        assertEq(lastAccrued, state.lastAccruedBeforeTransfer, "lastAccruedAt must still match pre-transfer");
        assertEq(executor, address(0), "executor must remain cleared");
        assertEq(state.marginCall.currentDebt(state.tokenId), state.debtBeforeTransfer, "debt unchanged until B repays");

        uint256 remaining = state.marginCall.currentDebt(state.tokenId);
        vm.startBroadcast(bobKey);
        state.usdc.mint(state.bob, remaining);
        state.usdc.approve(address(state.marginCall), remaining);
        state.marginCall.repay(state.tokenId, remaining);
        vm.stopBroadcast();

        uint256 debtAfter = state.marginCall.currentDebt(state.tokenId);
        if (debtAfter != 0) {
            revert DebtNotCleared(debtAfter);
        }
        (uint256 stockFinal,,,,) = state.marginCall.positions(state.tokenId);
        assertEq(stockFinal, state.stockBeforeTransfer, "repay must not change stock");
        assertEq(state.marginCall.ownerOf(state.tokenId), state.bob, "B remains owner");

        console.log("bob repaid remaining debt", remaining);
        console.log("=== PASS: A open -> E repay -> A transfer B -> A/E lose authority -> B repays ===");
    }

    function _persist(HarnessState memory state) private {
        string memory obj = "executor-transfer-local";
        vm.serializeAddress(obj, "alice", state.alice);
        vm.serializeAddress(obj, "executor", state.executor);
        vm.serializeAddress(obj, "bob", state.bob);
        vm.serializeAddress(obj, "nvdac", address(state.nvdac));
        vm.serializeAddress(obj, "usdc", address(state.usdc));
        vm.serializeAddress(obj, "pool", address(state.pool));
        vm.serializeAddress(obj, "marginCall", address(state.marginCall));
        vm.serializeUint(obj, "tokenId", state.tokenId);
        vm.serializeUint(obj, "contributedStock", state.contributedStock);
        vm.serializeUint(obj, "stockAtOpen", state.stockAtOpen);
        vm.serializeUint(obj, "principalAtOpen", state.principalAtOpen);
        vm.serializeUint(obj, "openedAt", state.openedAt);
        vm.serializeUint(obj, "stockBeforeTransfer", state.stockBeforeTransfer);
        vm.serializeUint(obj, "principalBeforeTransfer", state.principalBeforeTransfer);
        vm.serializeUint(obj, "accruedBeforeTransfer", state.accruedBeforeTransfer);
        vm.serializeUint(obj, "lastAccruedBeforeTransfer", state.lastAccruedBeforeTransfer);
        string memory json = vm.serializeUint(obj, "debtBeforeTransfer", state.debtBeforeTransfer);
        vm.writeJson(json, STATE_PATH);
    }

    function _load() private view returns (HarnessState memory state) {
        string memory json = vm.readFile(STATE_PATH);
        state.alice = vm.parseJsonAddress(json, ".alice");
        state.executor = vm.parseJsonAddress(json, ".executor");
        state.bob = vm.parseJsonAddress(json, ".bob");
        state.nvdac = MockNvdaC(vm.parseJsonAddress(json, ".nvdac"));
        state.usdc = MockUsdc(vm.parseJsonAddress(json, ".usdc"));
        state.pool = CreditPool(vm.parseJsonAddress(json, ".pool"));
        state.marginCall = MarginCall(vm.parseJsonAddress(json, ".marginCall"));
        state.tokenId = vm.parseJsonUint(json, ".tokenId");
        state.contributedStock = vm.parseJsonUint(json, ".contributedStock");
        state.stockAtOpen = vm.parseJsonUint(json, ".stockAtOpen");
        state.principalAtOpen = vm.parseJsonUint(json, ".principalAtOpen");
        state.openedAt = vm.parseJsonUint(json, ".openedAt");
        state.stockBeforeTransfer = vm.parseJsonUint(json, ".stockBeforeTransfer");
        state.principalBeforeTransfer = vm.parseJsonUint(json, ".principalBeforeTransfer");
        state.accruedBeforeTransfer = vm.parseJsonUint(json, ".accruedBeforeTransfer");
        state.lastAccruedBeforeTransfer = vm.parseJsonUint(json, ".lastAccruedBeforeTransfer");
        state.debtBeforeTransfer = vm.parseJsonUint(json, ".debtBeforeTransfer");
    }
}
