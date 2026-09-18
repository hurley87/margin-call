// SPDX-License-Identifier: MIT
pragma solidity 0.8.29;

import {console} from "forge-std/console.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {CreditPool} from "../src/CreditPool.sol";
import {LaunchAssets} from "../src/LaunchAssets.sol";
import {MarginCall} from "../src/MarginCall.sol";
import {OracleAdapter} from "../src/OracleAdapter.sol";
import {V1Config} from "../src/V1Config.sol";
import {BaseMainnetHarnessBase} from "./BaseMainnetHarnessBase.sol";

/// @title AcceptLaunch
/// @notice Compact Base launch acceptance: seed, then financed open → repay → close on one launch rail.
/// @dev `dryRunFull` is a single fork simulation with cheatcode funding and `prank` (not broadcast),
///      so recorded txs are not re-simulated against an unfunded fork. Live phases are separate broadcasts.
///      Keys never logged. Does not reproduce the historical NVDA-only A→E→B path.
contract AcceptLaunch is BaseMainnetHarnessBase {
    string internal constant DEPLOY_STATE_PATH = "./deployments/base-launch-deploy.run.json";
    string internal constant ACCEPT_STATE_PATH = "./deployments/base-launch-accept.run.json";

    uint256 internal constant TOTAL_PHASES = 3;

    error UnsupportedHarnessLeverage(uint256 leverage);
    error CreditMismatch(uint256 available, uint256 expected);
    error TreasuryDidNotReceive(uint256 beforeBal, uint256 afterBal, uint256 amount);
    error DebtNotCleared(uint256 remaining);
    error MissingDeployState();

    /// @dev Every broadcasting phase must pin the chain and refuse to run under the dry-run flag.
    modifier liveBroadcastPhase() {
        _requireBaseMainnet();
        if (_isDryRun()) {
            revert LiveBroadcastForbiddenInDryRun();
        }
        _;
    }

    struct AcceptState {
        address operator;
        address marginCall;
        address creditPool;
        uint256 tokenId;
        uint256 assetId;
        uint256 creditSeed;
        uint256 treasuryWithdraw;
    }

    struct DryRunParams {
        uint256 stockAmount;
        uint256 leverage;
        uint256 creditSeed;
        uint256 treasuryWithdraw;
    }

    // -------------------------------------------------------------------------
    // Dry-run: one fork simulation (no broadcast). Deploys + accepts with deal().
    // -------------------------------------------------------------------------

    /// @notice Deploy the launch stack and run compact financed open → repay → close on a current Base fork.
    function dryRunFull() external {
        _requireBaseMainnet();
        if (!_isDryRun()) {
            revert DryRunRequired();
        }

        address operator = vm.addr(vm.envUint("OPERATOR_PRIVATE_KEY"));
        DryRunParams memory params = _dryRunParams();
        LaunchAssets.Asset memory smoke = LaunchAssets.launchSet()[0];

        console.log("=== DRY RUN: Base launch AcceptLaunch ===");
        console.log("operator / assetAdmin / treasury", operator);
        console.log("smoke asset", smoke.name);
        console.log("stockAmount", params.stockAmount);
        console.log("leverage", params.leverage);
        console.log("creditSeed", params.creditSeed);

        _fundDryRunActor(operator, 10 ether, params.creditSeed + 50e6);
        _fundDryRunStock(operator, smoke, params.stockAmount);

        vm.startPrank(operator);
        LaunchStack memory stack = _deployLaunchStack(operator);
        _assertLaunchStack(stack, operator, operator);
        _logEnumeratedAssets(stack.marginCall);

        OracleAdapter smokeOracle = OracleAdapter(stack.oracles[0]);
        _requireLive(smokeOracle);
        console.log("oracle LIVE price", smokeOracle.latestObservation().price);

        _usdc().transfer(address(stack.pool), params.creditSeed);
        assertEq(stack.pool.availableCredit(), params.creditSeed, "availableCredit after seed");

        IERC20(smoke.stock).approve(address(stack.marginCall), params.stockAmount);
        uint256 tokenId = stack.marginCall.openPosition(stack.assetIds[0], params.stockAmount, params.leverage, 0);
        MarginCall.Position memory pos = stack.marginCall.positions(tokenId);
        assertEq(stack.marginCall.ownerOf(tokenId), operator, "operator owns after open");
        assertEq(pos.assetId, stack.assetIds[0], "position assetId");
        assertGt(pos.stockAmount, params.stockAmount, "financed open buys additional stock");
        assertGt(pos.principal, 0, "financed open borrows");
        console.log("tokenId", tokenId);
        console.log("stockAfterOpen", pos.stockAmount);
        console.log("principalAtOpen", pos.principal);

        uint256 remaining = stack.marginCall.currentDebt(tokenId);
        uint256 payment = _repayCeiling(remaining);
        _usdc().approve(address(stack.marginCall), payment);
        stack.marginCall.repay(tokenId, payment);
        uint256 debtAfterRepay = stack.marginCall.currentDebt(tokenId);
        if (debtAfterRepay != 0) {
            revert DebtNotCleared(debtAfterRepay);
        }

        uint256 expectedStock = stack.marginCall.positions(tokenId).stockAmount;
        uint256 ownerBefore = IERC20(smoke.stock).balanceOf(operator);
        stack.marginCall.closePosition(tokenId);
        vm.stopPrank();

        _assertTokenDoesNotExist(stack.marginCall, tokenId);
        assertEq(IERC20(smoke.stock).balanceOf(operator), ownerBefore + expectedStock, "operator receives stock");
        console.log("=== DRY RUN PASS: deploy launch set -> seed -> financed open -> repay -> close ===");
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

    function _logEnumeratedAssets(MarginCall marginCall) private view {
        uint256 n = marginCall.assetCount();
        console.log("enumerated assetCount", n);
        for (uint256 i; i < n; ++i) {
            uint256 assetId = marginCall.assetAt(i);
            MarginCall.AssetConfig memory cfg = marginCall.assetConfig(assetId);
            console.log("assetAt", i);
            console.log("  assetId", assetId);
            console.log("  stock", cfg.stock);
            console.log("  oracle", address(cfg.oracle));
            console.log("  execution", address(cfg.execution));
        }
    }

    // -------------------------------------------------------------------------
    // Live phases (separate forge script --broadcast invocations)
    // -------------------------------------------------------------------------

    /// @notice Phase 1: require LIVE oracle, seed CreditPool, treasury idle withdraw.
    function seedAndTreasurySmoke() external liveBroadcastPhase {
        uint256 operatorKey = vm.envUint("OPERATOR_PRIVATE_KEY");
        address operator = vm.addr(operatorKey);
        AcceptState memory state = _loadDeployIntoAccept(operator);
        uint256 creditSeed = vm.envOr("MARGIN_CALL_CREDIT_SEED", DEFAULT_CREDIT_SEED);
        uint256 treasuryWithdraw = vm.envOr("MARGIN_CALL_TREASURY_WITHDRAW", DEFAULT_TREASURY_WITHDRAW);
        if (treasuryWithdraw >= creditSeed) {
            revert CreditMismatch(creditSeed, treasuryWithdraw);
        }
        state.creditSeed = creditSeed;
        state.treasuryWithdraw = treasuryWithdraw;

        _logPhase(1, "LIVE check + seed + treasury withdraw");
        MarginCall marginCall = MarginCall(state.marginCall);
        uint256 smokeAssetId = marginCall.assetAt(0);
        OracleAdapter oracle = OracleAdapter(address(marginCall.assetConfig(smokeAssetId).oracle));
        _requireLive(oracle);
        console.log("oracle LIVE price", oracle.latestObservation().price);

        CreditPool pool = CreditPool(state.creditPool);
        uint256 poolBefore = pool.availableCredit();
        uint256 operatorUsdcBefore = _usdc().balanceOf(operator);

        vm.startBroadcast(operatorKey);
        _usdc().transfer(address(pool), creditSeed);
        vm.stopBroadcast();

        uint256 available = pool.availableCredit();
        uint256 expected = poolBefore + creditSeed;
        if (available != expected) {
            revert CreditMismatch(available, expected);
        }

        vm.startBroadcast(operatorKey);
        pool.withdraw(treasuryWithdraw);
        vm.stopBroadcast();

        uint256 operatorUsdcAfter = _usdc().balanceOf(operator);
        if (operatorUsdcAfter != operatorUsdcBefore - creditSeed + treasuryWithdraw) {
            revert TreasuryDidNotReceive(operatorUsdcBefore, operatorUsdcAfter, treasuryWithdraw);
        }
        assertEq(pool.availableCredit(), expected - treasuryWithdraw, "idle reduced by withdraw");

        _persist(state);
        console.log("creditSeed", creditSeed);
        console.log("treasuryWithdraw", treasuryWithdraw);
        console.log("availableCredit", pool.availableCredit());
    }

    /// @notice Phase 2: operator opens a tiny financed position in the first launch rail.
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

        _logPhase(2, "operator openPosition (financed, first launch rail)");
        MarginCall marginCall = MarginCall(state.marginCall);
        uint256 assetId = marginCall.assetAt(0);
        OracleAdapter oracle = OracleAdapter(address(marginCall.assetConfig(assetId).oracle));
        _requireLive(oracle);

        address stock = marginCall.assetConfig(assetId).stock;
        uint256 poolBefore = CreditPool(state.creditPool).availableCredit();

        vm.startBroadcast(operatorKey);
        IERC20(stock).approve(address(marginCall), stockAmount);
        uint256 tokenId = marginCall.openPosition(assetId, stockAmount, leverage, 0);
        vm.stopBroadcast();

        MarginCall.Position memory pos = marginCall.positions(tokenId);
        assertEq(marginCall.ownerOf(tokenId), state.operator, "operator owns");
        assertEq(pos.assetId, assetId, "position assetId");
        assertGt(pos.stockAmount, stockAmount, "bought additional stock");
        assertGt(pos.principal, 0, "borrowed");
        assertEq(CreditPool(state.creditPool).availableCredit(), poolBefore - pos.principal, "pool drawn");

        state.tokenId = tokenId;
        state.assetId = assetId;
        _persist(state);

        console.log("tokenId", tokenId);
        console.log("assetId", assetId);
        console.log("stockAtOpen", pos.stockAmount);
        console.log("principalAtOpen", pos.principal);
    }

    /// @notice Phase 3: operator repays remaining debt and closes; NFT burns; stock returns.
    function repayAndClose() external liveBroadcastPhase {
        uint256 operatorKey = vm.envUint("OPERATOR_PRIVATE_KEY");
        AcceptState memory state = _load();
        _logPhase(3, "operator repay + closePosition");

        MarginCall marginCall = MarginCall(state.marginCall);
        assertEq(marginCall.ownerOf(state.tokenId), state.operator, "operator owns");

        uint256 remaining = marginCall.currentDebt(state.tokenId);
        uint256 payment = _repayCeiling(remaining);
        address stock = marginCall.assetConfig(state.assetId).stock;
        uint256 stockRemaining = marginCall.positions(state.tokenId).stockAmount;
        uint256 ownerBefore = IERC20(stock).balanceOf(state.operator);

        vm.startBroadcast(operatorKey);
        _usdc().approve(address(marginCall), payment);
        marginCall.repay(state.tokenId, payment);
        uint256 debtAfterRepay = marginCall.currentDebt(state.tokenId);
        if (debtAfterRepay != 0) {
            revert DebtNotCleared(debtAfterRepay);
        }
        marginCall.closePosition(state.tokenId);
        vm.stopBroadcast();

        _assertTokenDoesNotExist(marginCall, state.tokenId);
        assertEq(IERC20(stock).balanceOf(state.operator), ownerBefore + stockRemaining, "stock returned");
        console.log("debt repaid from", remaining);
        console.log("stock returned", stockRemaining);
        console.log("availableCredit", CreditPool(state.creditPool).availableCredit());
        console.log("=== PASS: Base launch financed open -> repay -> close ===");
    }

    function _logPhase(uint256 phase, string memory label) private pure {
        console.log(string.concat("phase ", vm.toString(phase), "/", vm.toString(TOTAL_PHASES), ": ", label));
    }

    function _loadDeployIntoAccept(address operator) private view returns (AcceptState memory state) {
        string memory json = vm.readFile(DEPLOY_STATE_PATH);
        state.operator = operator;
        state.marginCall = vm.parseJsonAddress(json, ".marginCall");
        state.creditPool = vm.parseJsonAddress(json, ".creditPool");
        if (state.marginCall == address(0) || state.creditPool == address(0)) {
            revert MissingDeployState();
        }
        address deployer = vm.parseJsonAddress(json, ".deployer");
        assertEq(deployer, operator, "operator must be deployer");
        assertEq(MarginCall(state.marginCall).INITIALIZER(), operator, "INITIALIZER");
        assertEq(MarginCall(state.marginCall).ASSET_ADMIN(), operator, "ASSET_ADMIN");
        assertEq(address(MarginCall(state.marginCall).creditPool()), state.creditPool, "wired pool");
        assertEq(CreditPool(state.creditPool).treasury(), operator, "treasury");
        assertEq(CreditPool(state.creditPool).borrower(), state.marginCall, "borrower");
        assertEq(MarginCall(state.marginCall).assetCount(), LAUNCH_ASSET_COUNT, "assetCount");
    }

    function _persist(AcceptState memory state) private {
        string memory obj = "base-launch-accept";
        vm.serializeAddress(obj, "operator", state.operator);
        vm.serializeAddress(obj, "marginCall", state.marginCall);
        vm.serializeAddress(obj, "creditPool", state.creditPool);
        vm.serializeUint(obj, "tokenId", state.tokenId);
        vm.serializeUint(obj, "assetId", state.assetId);
        vm.serializeUint(obj, "creditSeed", state.creditSeed);
        string memory json = vm.serializeUint(obj, "treasuryWithdraw", state.treasuryWithdraw);
        vm.writeJson(json, ACCEPT_STATE_PATH);
    }

    function _load() private view returns (AcceptState memory state) {
        string memory json = vm.readFile(ACCEPT_STATE_PATH);
        state.operator = vm.parseJsonAddress(json, ".operator");
        state.marginCall = vm.parseJsonAddress(json, ".marginCall");
        state.creditPool = vm.parseJsonAddress(json, ".creditPool");
        state.tokenId = vm.parseJsonUint(json, ".tokenId");
        state.assetId = vm.parseJsonUint(json, ".assetId");
        state.creditSeed = vm.parseJsonUint(json, ".creditSeed");
        state.treasuryWithdraw = vm.parseJsonUint(json, ".treasuryWithdraw");
    }
}
