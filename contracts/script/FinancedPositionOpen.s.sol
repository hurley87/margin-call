// SPDX-License-Identifier: MIT
pragma solidity 0.8.29;

import {console} from "forge-std/Script.sol";

import {CreditPool} from "../src/CreditPool.sol";
import {MarginCall} from "../src/MarginCall.sol";
import {V1Config} from "../src/V1Config.sol";
import {MockNvdaC, MockUsdc} from "../test/margincall/PositionNftTestDoubles.sol";
import {LocalHarnessBase} from "./LocalHarnessBase.sol";

/// @title FinancedPositionOpen
/// @notice Local-Anvil-only harness: ordinary EOA opens, accrues, repays, and closes a financed Position NFT.
/// @dev Requires `MARGIN_CALL_PRIVATE_KEY`. Never logs or hardcodes that key. Anvil-only (`31337`).
///
///      Run through `run-financed-local.sh`, which drives three phases against one node. The split is
///      load-bearing, not stylistic: `forge script --broadcast` simulates the whole body locally and only then
///      sends the recorded transactions, so an in-script `vm.warp` moves the simulation and never the node, and
///      even a mid-script `evm_increaseTime` would land before every broadcast, leaving open and repay in the
///      same on-chain instant. The only way to put real elapsed node time between the open and the repay is to
///      advance the node between two separate broadcasts. Phase 2 therefore forks from a node whose clock has
///      genuinely moved, so the debt it reads is accrual the chain agrees with, and phase 3 re-reads the settled
///      node to prove the interest actually reached the pool.
contract FinancedPositionOpen is LocalHarnessBase {
    uint256 internal constant DEFAULT_LEVERAGE = V1Config.LEVERAGE_1_25X;
    uint256 internal constant CREDIT_SEED = 1_000_000e6;
    uint256 internal constant REPAY_CAP_MARGIN = 1_000e6;

    /// @dev Gitignored (`deployments/*.run.json`); hands phase 1's addresses to phases 2 and 3.
    string internal constant STATE_PATH = "./deployments/financed-local.run.json";

    error UnsupportedHarnessLeverage(uint256 leverage);
    error NoAccrualOnNode(uint256 debt, uint256 principalAtOpen);

    struct HarnessState {
        address signer;
        MockNvdaC nvdac;
        MockUsdc usdc;
        CreditPool pool;
        MarginCall marginCall;
        uint256 tokenId;
        uint256 contributedStock;
        uint256 stockAtOpen;
        uint256 principalAtOpen;
        uint256 poolAtOpen;
        uint256 openedAt;
    }

    // Phase 1 - deploy the stack and open a financed position.
    function deployAndOpen() external {
        _requireLocalAnvil();

        uint256 privateKey = vm.envUint("MARGIN_CALL_PRIVATE_KEY");
        address signer = vm.addr(privateKey);
        uint256 contributedStock = vm.envOr("MARGIN_CALL_STOCK_AMOUNT", DEFAULT_STOCK_AMOUNT);
        uint256 leverage = vm.envOr("MARGIN_CALL_LEVERAGE_BPS", DEFAULT_LEVERAGE);
        if (contributedStock == 0) {
            revert ZeroStockAmount();
        }
        // Checked before `startBroadcast` so an unusable preset fails before anything is deployed.
        if (!V1Config.isFinancedLeverage(leverage)) {
            revert UnsupportedHarnessLeverage(leverage);
        }

        console.log("=== LOCAL ONLY: financed Position NFT debt lifecycle ===");
        console.log("phase 1/3: deploy + openPosition (financed)");
        console.log("chainId", block.chainid);
        console.log("signer", signer);
        console.log("stockAmount (raw NVDAc units)", contributedStock);
        console.log("targetLeverage bps", leverage);

        vm.startBroadcast(privateKey);

        (MockNvdaC nvdac, MockUsdc usdc,,, MarginCall marginCall, CreditPool pool, uint256 nvdaAssetId) =
            _deployMockStack(signer, false);
        usdc.mint(address(pool), CREDIT_SEED);
        nvdac.mint(signer, contributedStock);
        nvdac.approve(address(marginCall), contributedStock);

        uint256 tokenId = marginCall.openPosition(nvdaAssetId, contributedStock, leverage, 0);

        vm.stopBroadcast();

        MarginCall.Position memory pos = marginCall.positions(tokenId);
        uint256 stockAtOpen = pos.stockAmount;
        uint256 principalAtOpen = pos.principal;
        _persist(
            HarnessState({
                signer: signer,
                nvdac: nvdac,
                usdc: usdc,
                pool: pool,
                marginCall: marginCall,
                tokenId: tokenId,
                contributedStock: contributedStock,
                stockAtOpen: stockAtOpen,
                principalAtOpen: principalAtOpen,
                poolAtOpen: pool.availableCredit(),
                openedAt: block.timestamp
            })
        );

        console.log("tokenId", tokenId);
        console.log("recorded stockAmount", stockAtOpen);
        console.log("purchased stock (recorded - contributed)", stockAtOpen - contributedStock);
        console.log("principal (borrowed USDC raw)", principalAtOpen);
        console.log("state written to", STATE_PATH);
    }

    // Phase 2 - after the wrapper advances the node clock, repay the real debt and close.
    function repayAndClose() external {
        _requireLocalAnvil();

        uint256 privateKey = vm.envUint("MARGIN_CALL_PRIVATE_KEY");
        HarnessState memory state = _load();

        // Read from a node whose clock really moved, so this debt is accrual the chain agrees with.
        uint256 debt = state.marginCall.currentDebt(state.tokenId);

        console.log("phase 2/3: repay + closePosition");
        console.log("node seconds elapsed since open", block.timestamp - state.openedAt);
        console.log("principal at open", state.principalAtOpen);
        console.log("currentDebt read from node", debt);
        console.log("interest accrued on node", debt - state.principalAtOpen);

        // The point of the harness: if the node clock did not move, fail loudly instead of passing vacuously.
        if (debt <= state.principalAtOpen) {
            revert NoAccrualOnNode(debt, state.principalAtOpen);
        }

        // Oversized cap: the contract must pull only the debt owed at execution time and leave the rest. The cap
        // also absorbs the extra seconds of interest accruing between this read and the broadcast landing.
        uint256 repayCap = debt + REPAY_CAP_MARGIN;

        vm.startBroadcast(privateKey);
        state.usdc.mint(state.signer, repayCap);
        state.usdc.approve(address(state.marginCall), repayCap);
        state.marginCall.repay(state.tokenId, repayCap);
        state.marginCall.closePosition(state.tokenId);
        vm.stopBroadcast();

        console.log("repay cap offered", repayCap);
    }

    // Phase 3 - read-only verification against the settled node.
    function verify() external view {
        HarnessState memory state = _load();

        uint256 poolFinal = state.pool.availableCredit();
        uint256 signerNvda = state.nvdac.balanceOf(state.signer);
        uint256 custody = state.nvdac.balanceOf(address(state.marginCall));
        uint256 residualUsdc = state.usdc.balanceOf(address(state.marginCall));

        console.log("phase 3/3: verify settled node state");
        console.log("CreditPool USDC seeded", CREDIT_SEED);
        console.log("CreditPool USDC final", poolFinal);
        console.log("interest returned to pool (raw USDC)", poolFinal - CREDIT_SEED);
        console.log("signer NVDAc balance", signerNvda);
        console.log("MarginCall NVDAc custody", custody);
        console.log("MarginCall residual USDC", residualUsdc);

        // The assertion the old single-phase harness could not make: the pool is strictly richer than it was
        // seeded, which holds only if real interest accrued on the node and was actually repaid to it.
        assertGt(poolFinal, CREDIT_SEED, "pool must recover principal plus real interest");
        assertEq(signerNvda, state.stockAtOpen, "stock returned to signer");
        assertEq(custody, 0, "custody cleared");
        assertEq(residualUsdc, 0, "no residual USDC on MarginCall");

        MarginCall.Position memory pos = state.marginCall.positions(state.tokenId);
        uint256 assetId = pos.assetId;
        uint256 stock = pos.stockAmount;
        uint256 principal = pos.principal;
        uint256 accrued = pos.accruedInterest;
        uint256 lastAccrued = pos.lastAccruedAt;
        address executor = pos.executor;
        assertEq(assetId, 0);
        assertEq(stock, 0);
        assertEq(principal, 0);
        assertEq(accrued, 0);
        assertEq(lastAccrued, 0);
        assertEq(executor, address(0));

        _assertTokenDoesNotExist(state.marginCall, state.tokenId);

        console.log("=== PASS: open -> accrue (on node) -> repay -> close ===");
    }

    function _persist(HarnessState memory state) private {
        string memory obj = "financed-local";
        vm.serializeAddress(obj, "signer", state.signer);
        vm.serializeAddress(obj, "nvdac", address(state.nvdac));
        vm.serializeAddress(obj, "usdc", address(state.usdc));
        vm.serializeAddress(obj, "pool", address(state.pool));
        vm.serializeAddress(obj, "marginCall", address(state.marginCall));
        vm.serializeUint(obj, "tokenId", state.tokenId);
        vm.serializeUint(obj, "contributedStock", state.contributedStock);
        vm.serializeUint(obj, "stockAtOpen", state.stockAtOpen);
        vm.serializeUint(obj, "principalAtOpen", state.principalAtOpen);
        vm.serializeUint(obj, "poolAtOpen", state.poolAtOpen);
        string memory json = vm.serializeUint(obj, "openedAt", state.openedAt);
        vm.writeJson(json, STATE_PATH);
    }

    function _load() private view returns (HarnessState memory state) {
        string memory json = vm.readFile(STATE_PATH);
        state.signer = vm.parseJsonAddress(json, ".signer");
        state.nvdac = MockNvdaC(vm.parseJsonAddress(json, ".nvdac"));
        state.usdc = MockUsdc(vm.parseJsonAddress(json, ".usdc"));
        state.pool = CreditPool(vm.parseJsonAddress(json, ".pool"));
        state.marginCall = MarginCall(vm.parseJsonAddress(json, ".marginCall"));
        state.tokenId = vm.parseJsonUint(json, ".tokenId");
        state.contributedStock = vm.parseJsonUint(json, ".contributedStock");
        state.stockAtOpen = vm.parseJsonUint(json, ".stockAtOpen");
        state.principalAtOpen = vm.parseJsonUint(json, ".principalAtOpen");
        state.poolAtOpen = vm.parseJsonUint(json, ".poolAtOpen");
        state.openedAt = vm.parseJsonUint(json, ".openedAt");
    }
}
