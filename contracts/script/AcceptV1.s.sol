// SPDX-License-Identifier: MIT
pragma solidity 0.8.29;

import {console} from "forge-std/console.sol";

import {CreditPool} from "../src/CreditPool.sol";
import {IOracleAdapter} from "../src/interfaces/IOracleAdapter.sol";
import {LaunchAssets} from "../src/LaunchAssets.sol";
import {MarginCall} from "../src/MarginCall.sol";
import {OracleAdapter} from "../src/OracleAdapter.sol";
import {V1Config} from "../src/V1Config.sol";
import {BaseMainnetHarnessBase} from "./BaseMainnetHarnessBase.sol";

/// @title AcceptV1
/// @notice Base-mainnet live acceptance: seed, treasury smoke, then A → E → B financed flow (issue #429).
/// @dev Phased broadcasts for live. `dryRunFull` is a single fork simulation with cheatcode funding.
///      No executor repay on mainnet (E needs only gas). Keys never logged.
contract AcceptV1 is BaseMainnetHarnessBase {
    string internal constant DEPLOY_STATE_PATH = "./deployments/base-deploy.run.json";
    string internal constant ACCEPT_STATE_PATH = "./deployments/base-accept.run.json";

    uint256 internal constant TOTAL_PHASES = 8;

    error UnsupportedHarnessLeverage(uint256 leverage);
    error OracleNotLive(uint8 state);
    error CreditMismatch(uint256 available, uint256 expected);
    error TreasuryDidNotReceive(uint256 beforeBal, uint256 afterBal, uint256 amount);
    error AuthorityStillHeld(string role);
    error DebtNotCleared(uint256 remaining);
    error ReduceDidNotCutStock(uint256 beforeStock, uint256 afterStock);
    error MissingDeployState();

    /// @dev Every broadcasting phase must pin the chain and refuse to run under the dry-run flag. Applying this
    ///      by construction means a phase added later cannot silently omit the guard.
    modifier liveBroadcastPhase() {
        _requireBaseMainnet();
        if (_isDryRun()) {
            revert LiveBroadcastForbiddenInDryRun();
        }
        _;
    }

    struct AcceptState {
        address alice;
        address executor;
        address bob;
        address oracle;
        address marginCall;
        address creditPool;
        uint256 tokenId;
        uint256 principalAtOpen;
        uint256 openedAt;
        uint256 stockBeforeTransfer;
        uint256 principalBeforeTransfer;
        uint256 accruedBeforeTransfer;
        uint256 lastAccruedBeforeTransfer;
        uint256 debtBeforeTransfer;
        uint256 creditSeed;
        uint256 treasuryWithdraw;
    }

    // -------------------------------------------------------------------------
    // Dry-run: one fork simulation (no broadcast). Deploys + accepts with deal().
    // -------------------------------------------------------------------------

    /// @notice Full A→E→B acceptance against a current Base fork. Requires `MARGIN_CALL_DRY_RUN=1`.
    function dryRunFull() external {
        _requireBaseMainnet();
        if (!_isDryRun()) {
            revert DryRunRequired();
        }

        address alice = vm.addr(vm.envUint("OPERATOR_PRIVATE_KEY"));
        address executor = vm.addr(vm.envUint("EXECUTOR_PRIVATE_KEY"));
        address bob = vm.addr(vm.envUint("RECIPIENT_PRIVATE_KEY"));
        _requireDistinctWallets(alice, executor, bob);

        DryRunParams memory params = _dryRunParams();
        console.log("=== DRY RUN: Base AcceptV1 full flow ===");
        console.log("alice", alice);
        console.log("executor", executor);
        console.log("bob", bob);
        console.log("stockAmount", params.stockAmount);
        console.log("leverage", params.leverage);
        console.log("creditSeed", params.creditSeed);
        console.log("treasuryWithdraw", params.treasuryWithdraw);

        _fundDryRunActor(alice, 10 ether, params.creditSeed + 50e6, params.stockAmount);
        _fundDryRunActor(executor, 1 ether, 0, 0);
        _fundDryRunActor(bob, 1 ether, 5e6, 0);

        (OracleAdapter oracle,, MarginCall marginCall, CreditPool pool, uint256 nvdaAssetId) = _deployV1Stack(alice);
        _requireLive(oracle);
        uint256 tokenId = _dryRunSeedAndOpen(alice, executor, marginCall, pool, params, nvdaAssetId);
        _dryRunReduce(executor, marginCall, tokenId);
        uint256 stockAfter = _dryRunTransfer(alice, executor, bob, marginCall, tokenId);
        _proveAuthorityLost(marginCall, tokenId, alice, executor);
        _dryRunBobSettle(bob, marginCall, tokenId, stockAfter);

        console.log("tokenId", tokenId);
        console.log("=== DRY RUN PASS: seed -> treasury -> A open -> E reduce -> A transfer B -> B repay/close ===");
    }

    struct DryRunParams {
        uint256 stockAmount;
        uint256 leverage;
        uint256 creditSeed;
        uint256 treasuryWithdraw;
    }

    function _dryRunParams() private view returns (DryRunParams memory params) {
        params.stockAmount = vm.envOr("MARGIN_CALL_STOCK_AMOUNT", DEFAULT_STOCK_AMOUNT);
        params.leverage = vm.envOr("MARGIN_CALL_LEVERAGE_BPS", DEFAULT_LEVERAGE);
        params.creditSeed = vm.envOr("MARGIN_CALL_CREDIT_SEED", DEFAULT_CREDIT_SEED);
        params.treasuryWithdraw = vm.envOr("MARGIN_CALL_TREASURY_WITHDRAW", DEFAULT_TREASURY_WITHDRAW);
        if (params.stockAmount == 0) {
            revert ZeroStockAmount();
        }
        if (!V1Config.isFinancedLeverage(params.leverage)) {
            revert UnsupportedHarnessLeverage(params.leverage);
        }
        if (params.treasuryWithdraw >= params.creditSeed) {
            revert CreditMismatch(params.creditSeed, params.treasuryWithdraw);
        }
    }

    function _dryRunSeedAndOpen(
        address alice,
        address executor,
        MarginCall marginCall,
        CreditPool pool,
        DryRunParams memory params,
        uint256 nvdaAssetId
    ) private returns (uint256 tokenId) {
        vm.startPrank(alice);
        _usdc().transfer(address(pool), params.creditSeed);
        assertEq(pool.availableCredit(), params.creditSeed, "availableCredit after seed");
        uint256 usdcBefore = _usdc().balanceOf(alice);
        pool.withdraw(params.treasuryWithdraw);
        assertEq(_usdc().balanceOf(alice), usdcBefore + params.treasuryWithdraw, "treasury receives withdraw");
        assertEq(pool.availableCredit(), params.creditSeed - params.treasuryWithdraw, "pool after withdraw");

        _nvdac().approve(address(marginCall), params.stockAmount);
        tokenId = marginCall.openPosition(nvdaAssetId, params.stockAmount, params.leverage, 0);
        marginCall.setExecutor(tokenId, executor);
        vm.stopPrank();

        MarginCall.Position memory pos = marginCall.positions(tokenId);
        uint256 stockAfterOpen = pos.stockAmount;
        uint256 principalAtOpen = pos.principal;
        assertEq(marginCall.ownerOf(tokenId), alice, "A owns after open");
        assertGt(stockAfterOpen, params.stockAmount, "financed open buys additional NVDAc");
        assertGt(principalAtOpen, 0, "financed open borrows");
        console.log("principalAtOpen", principalAtOpen);
        console.log("stockAfterOpen", stockAfterOpen);
    }

    function _dryRunReduce(address executor, MarginCall marginCall, uint256 tokenId) private {
        MarginCall.Position memory pos = marginCall.positions(tokenId);
        uint256 stockBefore = pos.stockAmount;
        address executorBefore = pos.executor;
        assertEq(executorBefore, executor, "executor set before reduce");

        uint256 sale = _reduceSale(stockBefore);
        assertLt(sale, stockBefore, "sale leaves residual");

        uint256 debtBeforeReduce = marginCall.currentDebt(tokenId);
        vm.prank(executor);
        marginCall.reduceExposure(tokenId, sale, 0);
        uint256 stockAfterReduce = marginCall.positions(tokenId).stockAmount;
        if (stockAfterReduce != stockBefore - sale) {
            revert ReduceDidNotCutStock(stockBefore, stockAfterReduce);
        }
        assertLe(marginCall.currentDebt(tokenId), debtBeforeReduce, "debt must not rise on reduce");
        console.log("stock sold", sale);
    }

    function _dryRunTransfer(address alice, address executor, address bob, MarginCall marginCall, uint256 tokenId)
        private
        returns (uint256 stockAfter)
    {
        MarginCall.Position memory before = marginCall.positions(tokenId);
        assertEq(before.executor, executor, "executor set before transfer");
        uint256 debtBefore = marginCall.currentDebt(tokenId);

        vm.prank(alice);
        marginCall.safeTransferFrom(alice, bob, tokenId);

        assertEq(marginCall.ownerOf(tokenId), bob, "B owns after transfer");
        MarginCall.Position memory afterPos = marginCall.positions(tokenId);
        assertEq(afterPos.executor, address(0), "transfer clears executor");
        assertEq(afterPos.stockAmount, before.stockAmount, "stock survives");
        assertEq(afterPos.principal, before.principal, "principal survives");
        assertEq(afterPos.accruedInterest, before.accruedInterest, "accrued survives");
        assertEq(afterPos.lastAccruedAt, before.lastAccruedAt, "lastAccrued survives");
        assertGe(marginCall.currentDebt(tokenId), debtBefore, "debt keeps accruing");
        stockAfter = afterPos.stockAmount;
    }

    function _dryRunBobSettle(address bob, MarginCall marginCall, uint256 tokenId, uint256 expectedStock) private {
        uint256 remaining = marginCall.currentDebt(tokenId);
        uint256 payment = _repayCeiling(remaining);
        uint256 bobNvdacBefore = _nvdac().balanceOf(bob);

        vm.startPrank(bob);
        _usdc().approve(address(marginCall), payment);
        marginCall.repay(tokenId, payment);
        uint256 debtAfterRepay = marginCall.currentDebt(tokenId);
        if (debtAfterRepay != 0) {
            revert DebtNotCleared(debtAfterRepay);
        }
        marginCall.closePosition(tokenId);
        vm.stopPrank();

        _assertTokenDoesNotExist(marginCall, tokenId);
        assertEq(_nvdac().balanceOf(bob), bobNvdacBefore + expectedStock, "B receives remaining NVDAc");
    }

    // -------------------------------------------------------------------------
    // Live phases (separate forge script --broadcast invocations)
    // -------------------------------------------------------------------------

    /// @notice Phase 1: require LIVE oracle, seed CreditPool, treasury idle withdraw.
    function seedAndTreasurySmoke() external liveBroadcastPhase {
        uint256 operatorKey = vm.envUint("OPERATOR_PRIVATE_KEY");
        address alice = vm.addr(operatorKey);
        address executor = vm.addr(vm.envUint("EXECUTOR_PRIVATE_KEY"));
        address bob = vm.addr(vm.envUint("RECIPIENT_PRIVATE_KEY"));
        _requireDistinctWallets(alice, executor, bob);

        AcceptState memory state = _loadDeployIntoAccept(alice, executor, bob);
        uint256 creditSeed = vm.envOr("MARGIN_CALL_CREDIT_SEED", DEFAULT_CREDIT_SEED);
        uint256 treasuryWithdraw = vm.envOr("MARGIN_CALL_TREASURY_WITHDRAW", DEFAULT_TREASURY_WITHDRAW);
        if (treasuryWithdraw >= creditSeed) {
            revert CreditMismatch(creditSeed, treasuryWithdraw);
        }
        state.creditSeed = creditSeed;
        state.treasuryWithdraw = treasuryWithdraw;

        _logPhase(1, "LIVE check + seed + treasury withdraw");
        OracleAdapter oracle = OracleAdapter(state.oracle);
        _requireLive(oracle);

        CreditPool pool = CreditPool(state.creditPool);
        uint256 poolBefore = pool.availableCredit();
        uint256 aliceUsdcBefore = _usdc().balanceOf(alice);

        vm.startBroadcast(operatorKey);
        _usdc().transfer(address(pool), creditSeed);
        vm.stopBroadcast();

        uint256 available = pool.availableCredit();
        uint256 expected = poolBefore + creditSeed;
        if (available != expected) {
            revert CreditMismatch(available, expected);
        }
        assertEq(_usdc().balanceOf(address(pool)), available, "pool USDC matches availableCredit");

        vm.startBroadcast(operatorKey);
        pool.withdraw(treasuryWithdraw);
        vm.stopBroadcast();

        uint256 aliceUsdcAfter = _usdc().balanceOf(alice);
        if (aliceUsdcAfter != aliceUsdcBefore - creditSeed + treasuryWithdraw) {
            revert TreasuryDidNotReceive(aliceUsdcBefore, aliceUsdcAfter, treasuryWithdraw);
        }
        uint256 idleAfterWithdraw = pool.availableCredit();
        assertEq(idleAfterWithdraw, expected - treasuryWithdraw, "idle reduced by withdraw");

        _persist(state);
        console.log("creditSeed", creditSeed);
        console.log("treasuryWithdraw", treasuryWithdraw);
        console.log("availableCredit", idleAfterWithdraw);
    }

    /// @notice Phase 2: A opens a tiny financed position.
    function openFinanced() external liveBroadcastPhase {
        uint256 operatorKey = vm.envUint("OPERATOR_PRIVATE_KEY");
        AcceptState memory state = _load();
        uint256 stockAmount = vm.envOr("MARGIN_CALL_STOCK_AMOUNT", DEFAULT_STOCK_AMOUNT);
        uint256 leverage = vm.envOr("MARGIN_CALL_LEVERAGE_BPS", DEFAULT_LEVERAGE);
        if (stockAmount == 0) {
            revert ZeroStockAmount();
        }
        if (!V1Config.isFinancedLeverage(leverage)) {
            revert UnsupportedHarnessLeverage(leverage);
        }

        _logPhase(2, "A openPosition (financed)");
        _requireLive(OracleAdapter(state.oracle));

        MarginCall marginCall = MarginCall(state.marginCall);
        uint256 poolBefore = CreditPool(state.creditPool).availableCredit();

        vm.startBroadcast(operatorKey);
        _nvdac().approve(address(marginCall), stockAmount);
        uint256 nvdaAssetId = marginCall.assetIdOf(LaunchAssets.NVDAC);
        uint256 tokenId = marginCall.openPosition(nvdaAssetId, stockAmount, leverage, 0);
        vm.stopBroadcast();

        MarginCall.Position memory pos = marginCall.positions(tokenId);
        uint256 stockAtOpen = pos.stockAmount;
        uint256 principalAtOpen = pos.principal;
        assertEq(marginCall.ownerOf(tokenId), state.alice, "A owns");
        assertGt(stockAtOpen, stockAmount, "bought additional NVDAc");
        assertGt(principalAtOpen, 0, "borrowed");
        assertEq(CreditPool(state.creditPool).availableCredit(), poolBefore - principalAtOpen, "pool drawn");

        state.tokenId = tokenId;
        state.principalAtOpen = principalAtOpen;
        state.openedAt = block.timestamp;
        _persist(state);

        console.log("tokenId", tokenId);
        console.log("stockAtOpen", stockAtOpen);
        console.log("principalAtOpen", principalAtOpen);
    }

    /// @notice Phase 3: A appoints executor E.
    function setExecutor() external liveBroadcastPhase {
        uint256 operatorKey = vm.envUint("OPERATOR_PRIVATE_KEY");
        AcceptState memory state = _load();
        _logPhase(3, "A setExecutor(E)");

        MarginCall marginCall = MarginCall(state.marginCall);
        vm.startBroadcast(operatorKey);
        marginCall.setExecutor(state.tokenId, state.executor);
        vm.stopBroadcast();

        address executorAfter = marginCall.positions(state.tokenId).executor;
        assertEq(executorAfter, state.executor, "executor set");
        console.log("executor", state.executor);
    }

    /// @notice Phase 4: E performs a small reduceExposure while LIVE.
    function executorReduceExposure() external liveBroadcastPhase {
        uint256 executorKey = vm.envUint("EXECUTOR_PRIVATE_KEY");
        AcceptState memory state = _load();
        _logPhase(4, "E reduceExposure");
        _requireLive(OracleAdapter(state.oracle));

        MarginCall marginCall = MarginCall(state.marginCall);
        MarginCall.Position memory pos = marginCall.positions(state.tokenId);
        uint256 stockBefore = pos.stockAmount;
        address executorBefore = pos.executor;
        assertEq(executorBefore, state.executor, "executor still set");
        assertEq(marginCall.ownerOf(state.tokenId), state.alice, "A still owns");

        uint256 sale = _reduceSale(stockBefore);
        assertLt(sale, stockBefore, "sale leaves residual");

        uint256 debtBefore = marginCall.currentDebt(state.tokenId);
        uint256 aliceUsdcBefore = _usdc().balanceOf(state.alice);
        uint256 executorUsdcBefore = _usdc().balanceOf(state.executor);

        vm.startBroadcast(executorKey);
        marginCall.reduceExposure(state.tokenId, sale, 0);
        vm.stopBroadcast();

        uint256 stockAfter = marginCall.positions(state.tokenId).stockAmount;
        if (stockAfter != stockBefore - sale) {
            revert ReduceDidNotCutStock(stockBefore, stockAfter);
        }
        uint256 debtAfterReduce = marginCall.currentDebt(state.tokenId);
        assertLe(debtAfterReduce, debtBefore, "debt must not rise");
        assertEq(_usdc().balanceOf(state.executor), executorUsdcBefore, "executor gets no surplus");
        assertGe(_usdc().balanceOf(state.alice), aliceUsdcBefore, "surplus to owner");

        console.log("stock sold", sale);
        console.log("stock remaining", stockAfter);
        console.log("debt after reduce", debtAfterReduce);
    }

    /// @notice Phase 5: snapshot accounting, A transfers NFT to B.
    function transferToBob() external liveBroadcastPhase {
        uint256 operatorKey = vm.envUint("OPERATOR_PRIVATE_KEY");
        AcceptState memory state = _load();
        _logPhase(5, "snapshot + A transfer to B");

        MarginCall marginCall = MarginCall(state.marginCall);
        {
            MarginCall.Position memory pos = marginCall.positions(state.tokenId);
            assertEq(pos.executor, state.executor, "executor set before transfer");
            state.stockBeforeTransfer = pos.stockAmount;
            state.principalBeforeTransfer = pos.principal;
            state.accruedBeforeTransfer = pos.accruedInterest;
            state.lastAccruedBeforeTransfer = pos.lastAccruedAt;
            state.debtBeforeTransfer = marginCall.currentDebt(state.tokenId);
            _persist(state);
        }

        vm.startBroadcast(operatorKey);
        marginCall.safeTransferFrom(state.alice, state.bob, state.tokenId);
        vm.stopBroadcast();

        assertEq(marginCall.ownerOf(state.tokenId), state.bob, "B owns");
        {
            MarginCall.Position memory pos = marginCall.positions(state.tokenId);
            assertEq(pos.executor, address(0), "executor cleared");
            assertEq(pos.stockAmount, state.stockBeforeTransfer, "stock survives");
            assertEq(pos.principal, state.principalBeforeTransfer, "principal survives");
            assertEq(pos.accruedInterest, state.accruedBeforeTransfer, "accrued survives");
            assertEq(pos.lastAccruedAt, state.lastAccruedBeforeTransfer, "lastAccrued survives");
            assertGe(marginCall.currentDebt(state.tokenId), state.debtBeforeTransfer, "debt keeps accruing");
        }

        console.log("debt before transfer", state.debtBeforeTransfer);
        console.log("owner after", state.bob);
    }

    /// @notice Phase 6: simulation-only — A and E management calls must revert.
    function proveAuthorityLost() external {
        _requireBaseMainnet();
        AcceptState memory state = _load();
        _logPhase(6, "prove A and E lost management authority");

        MarginCall marginCall = MarginCall(state.marginCall);
        assertEq(marginCall.ownerOf(state.tokenId), state.bob, "B owns");
        _proveAuthorityLost(marginCall, state.tokenId, state.alice, state.executor);
        console.log("A and E management calls revert as required");
    }

    /// @notice Phase 7: B repays remaining debt to zero.
    function bobRepay() external liveBroadcastPhase {
        uint256 bobKey = vm.envUint("RECIPIENT_PRIVATE_KEY");
        AcceptState memory state = _load();
        _logPhase(7, "B repay remaining debt");

        MarginCall marginCall = MarginCall(state.marginCall);
        assertEq(marginCall.ownerOf(state.tokenId), state.bob, "B owns");

        MarginCall.Position memory pos = marginCall.positions(state.tokenId);
        uint256 stock = pos.stockAmount;
        uint256 principal = pos.principal;
        uint256 accrued = pos.accruedInterest;
        uint256 lastAccrued = pos.lastAccruedAt;
        address executor = pos.executor;
        assertEq(stock, state.stockBeforeTransfer, "stock matches pre-transfer");
        assertEq(principal, state.principalBeforeTransfer, "principal matches");
        assertEq(accrued, state.accruedBeforeTransfer, "accrued matches");
        assertEq(lastAccrued, state.lastAccruedBeforeTransfer, "lastAccrued matches");
        assertEq(executor, address(0), "executor cleared");

        uint256 remaining = marginCall.currentDebt(state.tokenId);
        assertGe(remaining, state.debtBeforeTransfer, "debt kept accruing");
        uint256 payment = _repayCeiling(remaining);

        vm.startBroadcast(bobKey);
        _usdc().approve(address(marginCall), payment);
        marginCall.repay(state.tokenId, payment);
        vm.stopBroadcast();

        uint256 debtAfterRepay = marginCall.currentDebt(state.tokenId);
        if (debtAfterRepay != 0) {
            revert DebtNotCleared(debtAfterRepay);
        }
        console.log("debt repaid from", remaining);
        console.log("repay ceiling", payment);
    }

    /// @notice Phase 8: B closes; NFT burns; B receives remaining NVDAc.
    function bobClose() external liveBroadcastPhase {
        uint256 bobKey = vm.envUint("RECIPIENT_PRIVATE_KEY");
        AcceptState memory state = _load();
        _logPhase(8, "B closePosition");

        MarginCall marginCall = MarginCall(state.marginCall);
        assertEq(marginCall.ownerOf(state.tokenId), state.bob, "B owns");
        assertEq(marginCall.currentDebt(state.tokenId), 0, "debt must be zero");
        uint256 stock = marginCall.positions(state.tokenId).stockAmount;
        uint256 bobNvdacBefore = _nvdac().balanceOf(state.bob);

        vm.startBroadcast(bobKey);
        marginCall.closePosition(state.tokenId);
        vm.stopBroadcast();

        _assertTokenDoesNotExist(marginCall, state.tokenId);
        assertEq(_nvdac().balanceOf(state.bob), bobNvdacBefore + stock, "B received NVDAc");
        console.log("stock returned to B", stock);
        console.log("availableCredit", CreditPool(state.creditPool).availableCredit());
        console.log("=== PASS: Base mainnet A -> E -> B acceptance ===");
    }

    // -------------------------------------------------------------------------
    // Internals
    // -------------------------------------------------------------------------

    function _requireLive(OracleAdapter oracle) private view {
        IOracleAdapter.Observation memory obs = oracle.latestObservation();
        if (obs.state != IOracleAdapter.State.LIVE) {
            revert OracleNotLive(uint8(obs.state));
        }
        console.log("oracle LIVE price", obs.price);
        console.log("oracle roundId", uint256(obs.roundId));
        console.log("oracle updatedAt", obs.updatedAt);
    }

    function _proveAuthorityLost(MarginCall marginCall, uint256 tokenId, address alice, address executor) private {
        uint256 probe = marginCall.currentDebt(tokenId);
        if (probe == 0) {
            probe = 1;
        }
        uint256 saleProbe = 1;

        vm.prank(alice);
        try marginCall.repay(tokenId, probe) {
            revert AuthorityStillHeld("alice-repay");
        } catch {}
        vm.prank(executor);
        try marginCall.repay(tokenId, probe) {
            revert AuthorityStillHeld("executor-repay");
        } catch {}
        vm.prank(alice);
        try marginCall.reduceExposure(tokenId, saleProbe, 0) {
            revert AuthorityStillHeld("alice-reduceExposure");
        } catch {}
        vm.prank(executor);
        try marginCall.reduceExposure(tokenId, saleProbe, 0) {
            revert AuthorityStillHeld("executor-reduceExposure");
        } catch {}
        vm.prank(alice);
        try marginCall.setExecutor(tokenId, alice) {
            revert AuthorityStillHeld("alice-setExecutor");
        } catch {}
        vm.prank(executor);
        try marginCall.setExecutor(tokenId, executor) {
            revert AuthorityStillHeld("executor-setExecutor");
        } catch {}
    }

    function _logPhase(uint256 phase, string memory label) private pure {
        console.log(string.concat("phase ", vm.toString(phase), "/", vm.toString(TOTAL_PHASES), ": ", label));
    }

    function _loadDeployIntoAccept(address alice, address executor, address bob)
        private
        view
        returns (AcceptState memory state)
    {
        string memory json = vm.readFile(DEPLOY_STATE_PATH);
        state.alice = alice;
        state.executor = executor;
        state.bob = bob;
        state.oracle = vm.parseJsonAddress(json, ".oracle");
        state.marginCall = vm.parseJsonAddress(json, ".marginCall");
        state.creditPool = vm.parseJsonAddress(json, ".creditPool");
        if (state.marginCall == address(0) || state.creditPool == address(0) || state.oracle == address(0)) {
            revert MissingDeployState();
        }
        address deployer = vm.parseJsonAddress(json, ".deployer");
        assertEq(deployer, alice, "operator must be deployer");
        assertEq(MarginCall(state.marginCall).INITIALIZER(), alice, "INITIALIZER");
        assertEq(address(MarginCall(state.marginCall).creditPool()), state.creditPool, "wired pool");
        assertEq(CreditPool(state.creditPool).treasury(), alice, "treasury");
    }

    function _persist(AcceptState memory state) private {
        string memory obj = "base-accept";
        vm.serializeAddress(obj, "alice", state.alice);
        vm.serializeAddress(obj, "executor", state.executor);
        vm.serializeAddress(obj, "bob", state.bob);
        vm.serializeAddress(obj, "oracle", state.oracle);
        vm.serializeAddress(obj, "marginCall", state.marginCall);
        vm.serializeAddress(obj, "creditPool", state.creditPool);
        vm.serializeUint(obj, "tokenId", state.tokenId);
        vm.serializeUint(obj, "principalAtOpen", state.principalAtOpen);
        vm.serializeUint(obj, "openedAt", state.openedAt);
        vm.serializeUint(obj, "stockBeforeTransfer", state.stockBeforeTransfer);
        vm.serializeUint(obj, "principalBeforeTransfer", state.principalBeforeTransfer);
        vm.serializeUint(obj, "accruedBeforeTransfer", state.accruedBeforeTransfer);
        vm.serializeUint(obj, "lastAccruedBeforeTransfer", state.lastAccruedBeforeTransfer);
        vm.serializeUint(obj, "debtBeforeTransfer", state.debtBeforeTransfer);
        vm.serializeUint(obj, "creditSeed", state.creditSeed);
        string memory json = vm.serializeUint(obj, "treasuryWithdraw", state.treasuryWithdraw);
        vm.writeJson(json, ACCEPT_STATE_PATH);
    }

    function _load() private view returns (AcceptState memory state) {
        string memory json = vm.readFile(ACCEPT_STATE_PATH);
        state.alice = vm.parseJsonAddress(json, ".alice");
        state.executor = vm.parseJsonAddress(json, ".executor");
        state.bob = vm.parseJsonAddress(json, ".bob");
        state.oracle = vm.parseJsonAddress(json, ".oracle");
        state.marginCall = vm.parseJsonAddress(json, ".marginCall");
        state.creditPool = vm.parseJsonAddress(json, ".creditPool");
        state.tokenId = vm.parseJsonUint(json, ".tokenId");
        state.principalAtOpen = vm.parseJsonUint(json, ".principalAtOpen");
        state.openedAt = vm.parseJsonUint(json, ".openedAt");
        state.stockBeforeTransfer = vm.parseJsonUint(json, ".stockBeforeTransfer");
        state.principalBeforeTransfer = vm.parseJsonUint(json, ".principalBeforeTransfer");
        state.accruedBeforeTransfer = vm.parseJsonUint(json, ".accruedBeforeTransfer");
        state.lastAccruedBeforeTransfer = vm.parseJsonUint(json, ".lastAccruedBeforeTransfer");
        state.debtBeforeTransfer = vm.parseJsonUint(json, ".debtBeforeTransfer");
        state.creditSeed = vm.parseJsonUint(json, ".creditSeed");
        state.treasuryWithdraw = vm.parseJsonUint(json, ".treasuryWithdraw");
    }
}
