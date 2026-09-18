// SPDX-License-Identifier: MIT
pragma solidity 0.8.29;

import {console} from "forge-std/Script.sol";

import {CreditPool} from "../src/CreditPool.sol";
import {MarginCall} from "../src/MarginCall.sol";
import {V1Config} from "../src/V1Config.sol";
import {MockNvdaC, MockUsdc} from "../test/margincall/PositionNftTestDoubles.sol";
import {LocalHarnessBase} from "./LocalHarnessBase.sol";

/// @title FinancedExecutorTransfer
/// @notice Local-Anvil-only A → E → B harness: open financed, appoint executor, E repays and reduces, A transfers to B.
/// @dev Requires three disposable Anvil keys. Never logs or hardcodes them. Anvil-only (`31337`).
///
///      Run through `run-executor-transfer-local.sh`, which advances the node clock between open and the
///      executor/transfer phase. `forge script --broadcast` cannot `vm.warp` the live node.
contract FinancedExecutorTransfer is LocalHarnessBase {
    uint256 internal constant DEFAULT_LEVERAGE = V1Config.LEVERAGE_1_25X;
    uint256 internal constant CREDIT_SEED = 1_000_000e6;
    /// @dev Partial repay size as a fraction of current debt (bps). 2500 = 25%.
    uint256 internal constant PARTIAL_REPAY_BPS = 2_500;
    /// @dev Phases in this harness. Lives here so inserting a phase is one edit, not one per log line.
    uint256 internal constant TOTAL_PHASES = 6;
    /// @dev Small reduceExposure size as a fraction of recorded stock (bps). 500 = 5%.
    uint256 internal constant REDUCE_SALE_BPS = 500;
    /// @dev Overestimate applied to B's final repay (bps) so interest accruing between the debt read and the
    ///      repay transaction landing cannot leave a dust remainder. `repay` caps at min(amount, currentDebt).
    uint256 internal constant REPAY_BUFFER_BPS = 100;

    string internal constant STATE_PATH = "./deployments/executor-transfer-local.run.json";

    error UnsupportedHarnessLeverage(uint256 leverage);
    error NoAccrualOnNode(uint256 debt, uint256 principalAtOpen);
    error AuthorityStillHeld(string role);
    error DebtNotCleared(uint256 remaining);
    error ReduceDidNotCutStock(uint256 beforeStock, uint256 afterStock);

    struct HarnessState {
        address alice;
        address executor;
        address bob;
        MockUsdc usdc;
        MarginCall marginCall;
        uint256 tokenId;
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
        address executor = vm.addr(vm.envUint("MARGIN_CALL_EXECUTOR_KEY"));
        address bob = vm.addr(vm.envUint("MARGIN_CALL_RECIPIENT_KEY"));
        console.log("=== LOCAL ONLY: financed A -> E -> B executor transfer ===");
        _logPhase(1, "deploy + openPosition (financed)");
        console.log("chainId", block.chainid);
        console.log("alice", alice);
        console.log("executor", executor);
        console.log("bob", bob);
        console.log("stockAmount (raw NVDAc units)", contributedStock);
        console.log("targetLeverage bps", leverage);

        vm.startBroadcast(aliceKey);
        (MockNvdaC nvdac, MockUsdc usdc,,, MarginCall marginCall, CreditPool pool, uint256 nvdaAssetId) =
            _deployMockStack(alice, false);
        usdc.mint(address(pool), CREDIT_SEED);
        nvdac.mint(alice, contributedStock);
        nvdac.approve(address(marginCall), contributedStock);
        uint256 tokenId = marginCall.openPosition(nvdaAssetId, contributedStock, leverage, 0);
        vm.stopBroadcast();

        _persistOpen(alice, executor, bob, usdc, marginCall, tokenId);
        console.log("tokenId", tokenId);
        console.log("state written to", STATE_PATH);
    }

    function _persistOpen(
        address alice,
        address executor,
        address bob,
        MockUsdc usdc,
        MarginCall marginCall,
        uint256 tokenId
    ) private {
        MarginCall.Position memory pos = marginCall.positions(tokenId);
        uint256 stockAtOpen = pos.stockAmount;
        uint256 principalAtOpen = pos.principal;
        console.log("recorded stockAmount", stockAtOpen);
        console.log("principal (borrowed USDC raw)", principalAtOpen);
        _persist(
            HarnessState({
                alice: alice,
                executor: executor,
                bob: bob,
                usdc: usdc,
                marginCall: marginCall,
                tokenId: tokenId,
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
        _logPhase(2, "setExecutor + E partial repay");
        console.log("node seconds elapsed since open", block.timestamp - state.openedAt);
        console.log("principal at open", state.principalAtOpen);
        console.log("currentDebt read from node", debt);

        if (debt <= state.principalAtOpen) {
            revert NoAccrualOnNode(debt, state.principalAtOpen);
        }

        vm.startBroadcast(aliceKey);
        state.marginCall.setExecutor(state.tokenId, state.executor);
        vm.stopBroadcast();

        address executorAfterSet = state.marginCall.positions(state.tokenId).executor;
        assertEq(executorAfterSet, state.executor, "executor must be set");

        uint256 partialPay = (debt * PARTIAL_REPAY_BPS) / V1Config.BPS_DENOMINATOR;

        vm.startBroadcast(executorKey);
        state.usdc.mint(state.executor, partialPay);
        state.usdc.approve(address(state.marginCall), partialPay);
        state.marginCall.repay(state.tokenId, partialPay);
        vm.stopBroadcast();

        console.log("partial repay (raw USDC)", partialPay);
        console.log("executor set to", state.executor);
    }

    // Phase 3 - E performs a small reduceExposure while pricing is LIVE (mock oracle stays LIVE).
    function executorReduceExposure() external {
        _requireLocalAnvil();

        uint256 executorKey = vm.envUint("MARGIN_CALL_EXECUTOR_KEY");
        HarnessState memory state = _load();

        _logPhase(3, "E reduceExposure");

        MarginCall.Position memory pos = state.marginCall.positions(state.tokenId);
        uint256 stockBefore = pos.stockAmount;
        address executorBefore = pos.executor;
        assertEq(executorBefore, state.executor, "executor must still be set");
        assertEq(state.marginCall.ownerOf(state.tokenId), state.alice, "A must still own");

        uint256 sale = (stockBefore * REDUCE_SALE_BPS) / V1Config.BPS_DENOMINATOR;
        assertGt(sale, 0, "sale must be nonzero");
        assertLt(sale, stockBefore, "sale must leave residual stock");

        uint256 debtBefore = state.marginCall.currentDebt(state.tokenId);
        uint256 aliceUsdcBefore = state.usdc.balanceOf(state.alice);
        uint256 executorUsdcBefore = state.usdc.balanceOf(state.executor);

        vm.startBroadcast(executorKey);
        // minOut = 0 so the protocol oracle floor binds inside ExecutionAdapter.
        state.marginCall.reduceExposure(state.tokenId, sale, 0);
        vm.stopBroadcast();

        uint256 stockAfter = state.marginCall.positions(state.tokenId).stockAmount;
        if (stockAfter != stockBefore - sale) {
            revert ReduceDidNotCutStock(stockBefore, stockAfter);
        }
        uint256 debtAfter = state.marginCall.currentDebt(state.tokenId);
        assertLe(debtAfter, debtBefore, "debt must not increase");
        assertEq(state.usdc.balanceOf(state.executor), executorUsdcBefore, "executor gets no surplus");
        assertGe(state.usdc.balanceOf(state.alice), aliceUsdcBefore, "any surplus goes to owner A");

        console.log("stock sold (raw NVDAc)", sale);
        console.log("stock remaining", stockAfter);
        console.log("debt after reduce", debtAfter);
    }

    // Phase 4 - separate broadcast: snapshot live post-reduce accounting, then A transfers to B.
    // Must be its own forge-script invocation so the snapshot reads settled chain state, not the
    // prior script's local simulation of the reduce.
    function transferToBob() external {
        _requireLocalAnvil();

        uint256 aliceKey = vm.envUint("MARGIN_CALL_PRIVATE_KEY");
        HarnessState memory state = _load();

        _logPhase(4, "snapshot live accounting and transfer to B");

        {
            MarginCall.Position memory pos = state.marginCall.positions(state.tokenId);
            assertEq(pos.executor, state.executor, "executor must be set before transfer");
            state.stockBeforeTransfer = pos.stockAmount;
            state.principalBeforeTransfer = pos.principal;
            state.accruedBeforeTransfer = pos.accruedInterest;
            state.lastAccruedBeforeTransfer = pos.lastAccruedAt;
            state.debtBeforeTransfer = state.marginCall.currentDebt(state.tokenId);
            // Persist before broadcasting so a later verify phase still has the live snapshot even if
            // this script's post-broadcast simulation re-reads drifted local state.
            _persist(state);
        }

        vm.startBroadcast(aliceKey);
        state.marginCall.safeTransferFrom(state.alice, state.bob, state.tokenId);
        vm.stopBroadcast();

        address ownerAfter = state.marginCall.ownerOf(state.tokenId);
        assertEq(ownerAfter, state.bob, "B must own after transfer");
        {
            MarginCall.Position memory pos = state.marginCall.positions(state.tokenId);
            assertEq(pos.executor, address(0), "transfer must clear executor");
            assertEq(pos.stockAmount, state.stockBeforeTransfer, "stock must survive transfer");
            assertEq(pos.principal, state.principalBeforeTransfer, "principal must survive transfer");
            assertEq(pos.accruedInterest, state.accruedBeforeTransfer, "accrued must survive transfer");
            assertEq(pos.lastAccruedAt, state.lastAccruedBeforeTransfer, "lastAccruedAt must survive transfer");
            // Transfer does not call `_accrue`, so the checkpoint fields above are frozen. `currentDebt` is a live
            // function of `block.timestamp` and keeps climbing, so it may only be greater or equal.
            assertGe(
                state.marginCall.currentDebt(state.tokenId),
                state.debtBeforeTransfer,
                "debt must keep accruing across transfer"
            );
            console.log("debt before transfer", state.debtBeforeTransfer);
            console.log("owner after transfer", ownerAfter);
            console.log("executor after transfer", pos.executor);
        }
    }

    // Phase 5 - simulation-only: prove A and E lose repay / reduceExposure / setExecutor authority after transfer.
    function proveAuthorityLost() external {
        _requireLocalAnvil();
        HarnessState memory state = _load();

        _logPhase(5, "prove A and E lost management authority");

        assertEq(state.marginCall.ownerOf(state.tokenId), state.bob, "B must still own");
        MarginCall.Position memory pos = state.marginCall.positions(state.tokenId);
        uint256 stock = pos.stockAmount;
        address executor = pos.executor;
        assertEq(executor, address(0), "executor must stay cleared");
        assertGt(stock, 0, "position must still hold stock");

        uint256 probe = state.marginCall.currentDebt(state.tokenId);
        // 1 raw unit: `reduceExposure` checks authority before it validates the amount, and 1 is always
        // within recorded stock, so the revert can only be the authority failure this phase is proving.
        uint256 saleProbe = 1;

        // Fund approvals in simulation only; these writes are not broadcast.
        state.usdc.mint(state.alice, probe);
        state.usdc.mint(state.executor, probe);
        vm.prank(state.alice);
        state.usdc.approve(address(state.marginCall), probe);
        vm.prank(state.executor);
        state.usdc.approve(address(state.marginCall), probe);

        _assertRepayReverts(state, state.alice, probe, "alice-repay");
        _assertRepayReverts(state, state.executor, probe, "executor-repay");
        _assertReduceReverts(state, state.alice, saleProbe, "alice-reduceExposure");
        _assertReduceReverts(state, state.executor, saleProbe, "executor-reduceExposure");
        _assertSetExecutorReverts(state, state.alice, "alice-setExecutor");
        _assertSetExecutorReverts(state, state.executor, "executor-setExecutor");

        console.log("A and E management calls revert as required");
    }

    function _assertRepayReverts(HarnessState memory state, address caller, uint256 amount, string memory role)
        private
    {
        vm.prank(caller);
        try state.marginCall.repay(state.tokenId, amount) {
            revert AuthorityStillHeld(role);
        } catch {}
    }

    function _assertReduceReverts(HarnessState memory state, address caller, uint256 sale, string memory role) private {
        vm.prank(caller);
        try state.marginCall.reduceExposure(state.tokenId, sale, 0) {
            revert AuthorityStillHeld(role);
        } catch {}
    }

    function _assertSetExecutorReverts(HarnessState memory state, address caller, string memory role) private {
        vm.prank(caller);
        try state.marginCall.setExecutor(state.tokenId, caller) {
            revert AuthorityStillHeld(role);
        } catch {}
    }

    // Phase 6 - B repays remaining debt on the live node, then read-only settle checks.
    function bobRepayAndVerify() external {
        _requireLocalAnvil();

        uint256 bobKey = vm.envUint("MARGIN_CALL_RECIPIENT_KEY");
        HarnessState memory state = _load();

        _logPhase(6, "B repays remaining debt and verify");

        assertEq(state.marginCall.ownerOf(state.tokenId), state.bob, "B must own before repay");

        MarginCall.Position memory pos = state.marginCall.positions(state.tokenId);
        uint256 stock = pos.stockAmount;
        uint256 principal = pos.principal;
        uint256 accrued = pos.accruedInterest;
        uint256 lastAccrued = pos.lastAccruedAt;
        address executor = pos.executor;
        assertEq(stock, state.stockBeforeTransfer, "stock must still match pre-transfer");
        assertEq(principal, state.principalBeforeTransfer, "principal must still match pre-transfer");
        assertEq(accrued, state.accruedBeforeTransfer, "accrued must still match pre-transfer");
        assertEq(lastAccrued, state.lastAccruedBeforeTransfer, "lastAccruedAt must still match pre-transfer");
        assertEq(executor, address(0), "executor must remain cleared");

        uint256 remaining = state.marginCall.currentDebt(state.tokenId);
        assertGe(remaining, state.debtBeforeTransfer, "debt must keep accruing while B holds the position");

        // Interest accrues between this read and the repay transaction landing on the node, so submit a small
        // overestimate. `repay` transfers only min(amount, currentDebt), so the excess never leaves B's wallet.
        uint256 payment = remaining + (remaining * REPAY_BUFFER_BPS) / V1Config.BPS_DENOMINATOR + 1;

        vm.startBroadcast(bobKey);
        state.usdc.mint(state.bob, payment);
        state.usdc.approve(address(state.marginCall), payment);
        state.marginCall.repay(state.tokenId, payment);
        vm.stopBroadcast();

        uint256 debtAfter = state.marginCall.currentDebt(state.tokenId);
        if (debtAfter != 0) {
            revert DebtNotCleared(debtAfter);
        }
        uint256 stockFinal = state.marginCall.positions(state.tokenId).stockAmount;
        assertEq(stockFinal, state.stockBeforeTransfer, "repay must not change stock");
        assertEq(state.marginCall.ownerOf(state.tokenId), state.bob, "B remains owner");

        assertGt(state.usdc.balanceOf(state.bob), 0, "unused repay buffer must stay in B's wallet");

        console.log("debt read before repay", remaining);
        console.log("repay ceiling submitted", payment);
        console.log("=== PASS: A open -> E repay -> E reduce -> A transfer B -> A/E lose authority -> B repays ===");
    }

    /// @dev `phase N/TOTAL_PHASES: label`, so the denominator has one definition.
    function _logPhase(uint256 phase, string memory label) private pure {
        console.log(string.concat("phase ", vm.toString(phase), "/", vm.toString(TOTAL_PHASES), ": ", label));
    }

    function _persist(HarnessState memory state) private {
        string memory obj = "executor-transfer-local";
        vm.serializeAddress(obj, "alice", state.alice);
        vm.serializeAddress(obj, "executor", state.executor);
        vm.serializeAddress(obj, "bob", state.bob);
        vm.serializeAddress(obj, "usdc", address(state.usdc));
        vm.serializeAddress(obj, "marginCall", address(state.marginCall));
        vm.serializeUint(obj, "tokenId", state.tokenId);
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
        state.usdc = MockUsdc(vm.parseJsonAddress(json, ".usdc"));
        state.marginCall = MarginCall(vm.parseJsonAddress(json, ".marginCall"));
        state.tokenId = vm.parseJsonUint(json, ".tokenId");
        state.principalAtOpen = vm.parseJsonUint(json, ".principalAtOpen");
        state.openedAt = vm.parseJsonUint(json, ".openedAt");
        state.stockBeforeTransfer = vm.parseJsonUint(json, ".stockBeforeTransfer");
        state.principalBeforeTransfer = vm.parseJsonUint(json, ".principalBeforeTransfer");
        state.accruedBeforeTransfer = vm.parseJsonUint(json, ".accruedBeforeTransfer");
        state.lastAccruedBeforeTransfer = vm.parseJsonUint(json, ".lastAccruedBeforeTransfer");
        state.debtBeforeTransfer = vm.parseJsonUint(json, ".debtBeforeTransfer");
    }
}
