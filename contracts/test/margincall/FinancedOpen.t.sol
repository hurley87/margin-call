// SPDX-License-Identifier: MIT
pragma solidity 0.8.29;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {CreditPool} from "../../src/CreditPool.sol";
import {IOracleAdapter} from "../../src/interfaces/IOracleAdapter.sol";
import {MarginCall} from "../../src/MarginCall.sol";
import {V1Config} from "../../src/V1Config.sol";
import {BaseV1Constants} from "../fixtures/BaseV1Constants.sol";
import {MarginCallTestBase} from "./MarginCallTestBase.sol";

/// @dev Reports the values `setCreditPool` validates while `draw` supplies no USDC. Only reachable if an
///      unauthorized address can wire it.
contract ConformingHostilePool {
    IERC20 public immutable USDC;
    address public immutable borrower;

    constructor(address usdc_, address borrower_) {
        USDC = IERC20(usdc_);
        borrower = borrower_;
    }

    function availableCredit() external pure returns (uint256) {
        return type(uint256).max;
    }

    function draw(uint256) external {}
}

/// @dev RPC-free financed opening, credit capacity, oracle gates, and execution-bound coverage.
contract FinancedOpenTest is MarginCallTestBase {
    function test_spotOpenWorksWithEmptyPool() public {
        uint256 available = pool.availableCredit();
        vm.prank(address(marginCall));
        pool.draw(available);
        assertEq(pool.availableCredit(), 0);

        _fund(alice, ONE_NVDAC);
        uint256 tokenId = _open(alice, ONE_NVDAC);
        _assertLiveSpotPosition(tokenId, alice, ONE_NVDAC, OPENED_AT);
        assertEq(marginCall.currentDebt(tokenId), 0);
    }

    function test_spotOpenWorksBeforeCreditPoolWired() public {
        (MarginCall unwired, uint256 assetId) = _freshMarginCallWithAsset(assetAdmin);
        nvdac.mint(alice, ONE_NVDAC);
        vm.prank(alice);
        nvdac.approve(address(unwired), ONE_NVDAC);

        vm.prank(alice);
        uint256 tokenId = unwired.openPosition(assetId, ONE_NVDAC, SPOT_LEVERAGE, 0);
        assertEq(unwired.ownerOf(tokenId), alice);
        MarginCall.Position memory pos = unwired.positions(tokenId);
        uint256 stock = pos.stockAmount;
        uint256 principal = pos.principal;
        assertEq(stock, ONE_NVDAC);
        assertEq(principal, 0);
    }

    function test_setCreditPoolOnceAndValidatesBorrower() public {
        MarginCall fresh = new MarginCall(address(usdc), assetAdmin);
        CreditPool good = new CreditPool(address(usdc), address(fresh), treasury);
        fresh.setCreditPool(address(good));
        assertEq(address(fresh.creditPool()), address(good));

        vm.expectRevert(MarginCall.CreditPoolAlreadySet.selector);
        fresh.setCreditPool(address(good));

        CreditPool wrongBorrower = new CreditPool(address(usdc), address(this), treasury);
        MarginCall other = new MarginCall(address(usdc), assetAdmin);
        vm.expectRevert(MarginCall.InvalidCreditPool.selector);
        other.setCreditPool(address(wrongBorrower));
    }

    /// @dev A conforming-but-hostile pool passes every value check in `setCreditPool`, so the only thing standing
    ///      between deployment and permanently bricked financed opening is the `INITIALIZER` guard.
    function test_nonInitializerCannotWireTheCreditPool() public {
        MarginCall fresh = new MarginCall(address(usdc), assetAdmin);
        assertEq(fresh.INITIALIZER(), address(this), "deployer is the initializer");

        ConformingHostilePool hostile = new ConformingHostilePool(address(usdc), address(fresh));
        assertEq(address(hostile.USDC()), address(usdc), "hostile pool reports the real USDC");
        assertEq(hostile.borrower(), address(fresh), "hostile pool reports the real borrower");

        address[3] memory outsiders = [alice, bob, carol];
        for (uint256 i = 0; i < outsiders.length; ++i) {
            vm.prank(outsiders[i]);
            vm.expectRevert(abi.encodeWithSelector(MarginCall.NotInitializer.selector, outsiders[i]));
            fresh.setCreditPool(address(hostile));
        }
        assertEq(address(fresh.creditPool()), address(0), "pool stayed unwired");

        // The deployer can still wire the real pool, and only once.
        CreditPool real = new CreditPool(address(usdc), address(fresh), treasury);
        fresh.setCreditPool(address(real));
        assertEq(address(fresh.creditPool()), address(real));
        vm.expectRevert(MarginCall.CreditPoolAlreadySet.selector);
        fresh.setCreditPool(address(hostile));
    }

    function test_initializerIsTheDeployerNotTheCaller() public {
        vm.prank(alice);
        MarginCall aliceDeployed = new MarginCall(address(usdc), assetAdmin);
        assertEq(aliceDeployed.INITIALIZER(), alice);

        CreditPool poolForAlice = new CreditPool(address(usdc), address(aliceDeployed), treasury);
        vm.expectRevert(abi.encodeWithSelector(MarginCall.NotInitializer.selector, address(this)));
        aliceDeployed.setCreditPool(address(poolForAlice));

        vm.prank(alice);
        aliceDeployed.setCreditPool(address(poolForAlice));
        assertEq(address(aliceDeployed.creditPool()), address(poolForAlice));
    }

    function test_creditPoolDrawOnlyBorrower() public {
        vm.expectRevert(abi.encodeWithSelector(CreditPool.UnauthorizedBorrower.selector, address(this)));
        pool.draw(1);

        uint256 beforeBal = usdc.balanceOf(address(marginCall));
        vm.prank(address(marginCall));
        pool.draw(100e6);
        assertEq(usdc.balanceOf(address(marginCall)), beforeBal + 100e6);
        assertEq(pool.availableCredit(), DEFAULT_CREDIT - 100e6);
    }

    function test_financedOpenAllPresets() public {
        uint256[4] memory presets = [LEVERAGE_1_1X, LEVERAGE_1_25X, LEVERAGE_1_4X, LEVERAGE_1_5X];
        _fund(alice, 4 * ONE_NVDAC);

        for (uint256 i = 0; i < presets.length; ++i) {
            uint256 poolBefore = pool.availableCredit();
            uint256 custodyBefore = nvdac.balanceOf(address(marginCall));

            uint256 tokenId = _openFinanced(alice, ONE_NVDAC, presets[i], 0);

            MarginCall.Position memory pos = _position(tokenId);
            uint256 stock = pos.stockAmount;
            uint256 principal = pos.principal;
            uint256 accrued = pos.accruedInterest;
            uint256 lastAccrued = pos.lastAccruedAt;
            address executor = pos.executor;
            assertEq(tokenId, i + 1);
            assertEq(marginCall.ownerOf(tokenId), alice);
            assertGt(stock, ONE_NVDAC);
            assertGt(principal, 0);
            assertEq(accrued, 0);
            assertEq(lastAccrued, OPENED_AT);
            assertEq(executor, address(0));
            assertEq(marginCall.currentDebt(tokenId), principal);
            assertEq(pool.availableCredit(), poolBefore - principal);
            assertEq(nvdac.balanceOf(address(marginCall)), custodyBefore + stock);
            assertEq(usdc.balanceOf(address(marginCall)), 0);

            uint256 nav = oracle.valueUsdc(stock, BaseV1Constants.PINNED_FEED_ANSWER);
            // nav / (nav - debt) <= preset
            assertLe(nav * V1Config.BPS_DENOMINATOR, (nav - principal) * presets[i]);
            assertLe(nav * V1Config.BPS_DENOMINATOR, (nav - principal) * LEVERAGE_1_5X);
        }
    }

    function test_financedOpenEmitsCreditDrawn() public {
        _fund(alice, ONE_NVDAC);
        uint256 expectedPrincipal = _expectedPrincipal(ONE_NVDAC, LEVERAGE_1_25X);

        vm.expectEmit(true, true, true, false, address(marginCall));
        emit MarginCall.PositionOpened(1, alice, defaultAssetId, 0);
        vm.expectEmit(true, false, false, true, address(marginCall));
        emit MarginCall.CreditDrawn(1, expectedPrincipal);

        uint256 tokenId = _openFinanced(alice, ONE_NVDAC, LEVERAGE_1_25X, 0);
        uint256 principal = _position(tokenId).principal;
        assertEq(principal, expectedPrincipal);
    }

    function test_insufficientCreditRevertsAtomically() public {
        // Leave only $1 of credit — far below a 1.5x open on 1 NVDAc (~$100+).
        uint256 available = pool.availableCredit();
        vm.prank(address(marginCall));
        pool.draw(available - 1e6);
        assertEq(pool.availableCredit(), 1e6);

        _fund(alice, ONE_NVDAC);
        uint256 aliceBefore = nvdac.balanceOf(alice);
        uint256 poolBefore = pool.availableCredit();

        vm.prank(alice);
        vm.expectRevert();
        marginCall.openPosition(defaultAssetId, ONE_NVDAC, LEVERAGE_1_5X, 0);

        assertEq(nvdac.balanceOf(alice), aliceBefore);
        assertEq(nvdac.balanceOf(address(marginCall)), 0);
        assertEq(pool.availableCredit(), poolBefore);
        assertEq(marginCall.balanceOf(alice), 0);
        _assertTokenDoesNotExist(1);
    }

    function test_nonLiveOracleRevertsFinancedOpen() public {
        _fund(alice, 3 * ONE_NVDAC);

        IOracleAdapter.State[3] memory states =
            [IOracleAdapter.State.HELD, IOracleAdapter.State.INVALID, IOracleAdapter.State.HELD];
        for (uint256 i = 0; i < states.length; ++i) {
            oracle.setState(states[i]);
            vm.prank(alice);
            vm.expectRevert(abi.encodeWithSelector(MarginCall.OracleNotLive.selector, states[i]));
            marginCall.openPosition(defaultAssetId, ONE_NVDAC, LEVERAGE_1_1X, 0);
        }

        assertEq(nvdac.balanceOf(alice), 3 * ONE_NVDAC);
        assertEq(marginCall.balanceOf(alice), 0);
        assertEq(pool.availableCredit(), DEFAULT_CREDIT);
    }

    function test_financedOpenWithoutCreditPoolReverts() public {
        (MarginCall unwired, uint256 assetId) = _freshMarginCallWithAsset(assetAdmin);
        nvdac.mint(alice, ONE_NVDAC);
        vm.prank(alice);
        nvdac.approve(address(unwired), ONE_NVDAC);

        vm.prank(alice);
        vm.expectRevert(MarginCall.InvalidCreditPool.selector);
        unwired.openPosition(assetId, ONE_NVDAC, LEVERAGE_1_1X, 0);
    }

    function test_callerMinOutAboveFillRevertsAtomically() public {
        _fund(alice, ONE_NVDAC);
        uint256 principal = _expectedPrincipal(ONE_NVDAC, LEVERAGE_1_25X);
        uint256 protocolMin = execution.protocolMinStockOutForBuy(principal, BaseV1Constants.PINNED_FEED_ANSWER);

        uint256 aliceBefore = nvdac.balanceOf(alice);
        uint256 poolBefore = pool.availableCredit();

        vm.prank(alice);
        vm.expectRevert(bytes("Too little received"));
        marginCall.openPosition(defaultAssetId, ONE_NVDAC, LEVERAGE_1_25X, protocolMin + 1_000_000);

        assertEq(nvdac.balanceOf(alice), aliceBefore);
        assertEq(pool.availableCredit(), poolBefore);
        assertEq(usdc.balanceOf(address(marginCall)), 0);
        _assertTokenDoesNotExist(1);
    }

    function test_routerFailureRollsBackFinancedOpen() public {
        router.setShouldRevert(true);
        _fund(alice, ONE_NVDAC);
        uint256 aliceBefore = nvdac.balanceOf(alice);
        uint256 poolBefore = pool.availableCredit();

        vm.prank(alice);
        vm.expectRevert();
        marginCall.openPosition(defaultAssetId, ONE_NVDAC, LEVERAGE_1_4X, 0);

        assertEq(nvdac.balanceOf(alice), aliceBefore);
        assertEq(pool.availableCredit(), poolBefore);
        assertEq(usdc.balanceOf(address(marginCall)), 0);
        _assertTokenDoesNotExist(1);
    }

    function test_worseThanBoundFillStillRespectsLeverageWhenWithinProtocolMin() public {
        // Fill exactly at the 100 bps adverse bound.
        router.setFillBps(V1Config.ADVERSE_BOUND_BPS);
        _fund(alice, ONE_NVDAC);
        uint256 tokenId = _openFinanced(alice, ONE_NVDAC, LEVERAGE_1_5X, 0);
        MarginCall.Position memory pos = _position(tokenId);
        uint256 stock = pos.stockAmount;
        uint256 principal = pos.principal;
        uint256 nav = oracle.valueUsdc(stock, BaseV1Constants.PINNED_FEED_ANSWER);
        assertLe(nav * V1Config.BPS_DENOMINATOR, (nav - principal) * LEVERAGE_1_5X);
    }

    function test_sharedCustodyAcrossSpotAndFinanced() public {
        _fund(alice, 2 * ONE_NVDAC);
        _fund(bob, ONE_NVDAC);

        uint256 spotId = _open(alice, ONE_NVDAC);
        uint256 financedId = _openFinanced(bob, ONE_NVDAC, LEVERAGE_1_1X, 0);

        uint256 spotStock = _position(spotId).stockAmount;
        MarginCall.Position memory pos = _position(financedId);
        uint256 financedStock = pos.stockAmount;
        uint256 principal = pos.principal;
        assertEq(spotStock + financedStock, nvdac.balanceOf(address(marginCall)));
        assertEq(principal, marginCall.currentDebt(financedId));
        assertEq(marginCall.currentDebt(spotId), 0);

        // Spot close must not touch financed stock.
        vm.prank(alice);
        marginCall.closePosition(spotId);
        uint256 remaining = _position(financedId).stockAmount;
        assertEq(remaining, financedStock);
        assertEq(nvdac.balanceOf(address(marginCall)), financedStock);
    }

    function _freshMarginCallWithAsset(address admin) private returns (MarginCall mc, uint256 assetId) {
        mc = new MarginCall(address(usdc), admin);
        vm.prank(admin);
        assetId = mc.addAsset(address(nvdac), address(oracle), address(execution));
    }
}
