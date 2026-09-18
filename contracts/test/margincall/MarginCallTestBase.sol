// SPDX-License-Identifier: MIT
pragma solidity 0.8.29;

import {Test} from "forge-std/Test.sol";
import {IERC721Errors} from "@openzeppelin/contracts/interfaces/draft-IERC6093.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";

import {BaseV1Constants} from "../fixtures/BaseV1Constants.sol";
import {ExecutionFixtures} from "../fixtures/ExecutionFixtures.sol";
import {MaintenanceFixtures} from "../fixtures/MaintenanceFixtures.sol";
import {CreditPool} from "../../src/CreditPool.sol";
import {ExecutionAdapter} from "../../src/ExecutionAdapter.sol";
import {IOracleAdapter} from "../../src/interfaces/IOracleAdapter.sol";
import {MarginCall} from "../../src/MarginCall.sol";
import {V1Config} from "../../src/V1Config.sol";
import {MockNvdaC, MockOracleAdapter, MockSwapRouter, MockUsdc} from "./PositionNftTestDoubles.sol";

abstract contract MarginCallTestBase is Test {
    using Strings for uint256;

    /// @dev Asserted against `marginCall.SPOT_LEVERAGE()` in `setUp` so the literal cannot drift from the contract.
    uint256 internal constant SPOT_LEVERAGE = 10_000;
    uint256 internal constant LEVERAGE_1_1X = V1Config.LEVERAGE_1_1X;
    uint256 internal constant LEVERAGE_1_25X = V1Config.LEVERAGE_1_25X;
    uint256 internal constant LEVERAGE_1_4X = V1Config.LEVERAGE_1_4X;
    uint256 internal constant LEVERAGE_1_5X = V1Config.LEVERAGE_1_5X;
    /// @dev A deterministic nonzero open time owned by this suite. Deliberately not the fork suite's pinned block:
    ///      re-pinning that snapshot must not silently rewrite what these RPC-free assertions mean.
    uint256 internal constant OPENED_AT = 1_700_000_000;
    uint256 internal constant ONE_NVDAC = 10 ** uint256(BaseV1Constants.NVDAC_DECIMALS);

    uint256 internal constant LIQUIDATABLE_DEBT_SHARE_BPS = MaintenanceFixtures.LIQUIDATABLE_DEBT_SHARE_BPS;
    uint256 internal constant UNDERWATER_DEBT_SHARE_BPS = MaintenanceFixtures.UNDERWATER_DEBT_SHARE_BPS;

    /// @dev Default `reduceExposure` sale size: small enough to leave residual stock on a 1 NVDAc open.
    uint256 internal constant REDUCE_SALE = ONE_NVDAC / 20;
    uint256 internal constant DEFAULT_CREDIT = 1_000_000e6;
    /// @dev Pinned here rather than read from the contract so a change to the metadata origin has to be deliberate.
    string internal constant TOKEN_URI_BASE = "https://margincall.fun/api/nft/";

    MockNvdaC internal nvdac;
    MockUsdc internal usdc;
    MockOracleAdapter internal oracle;
    MockSwapRouter internal router;
    ExecutionAdapter internal execution;
    CreditPool internal pool;
    MarginCall internal marginCall;
    address internal alice;
    address internal bob;
    address internal carol;
    address internal treasury;
    address internal assetAdmin;
    uint256 internal defaultAssetId;

    function setUp() public virtual {
        alice = makeAddr("alice");
        bob = makeAddr("bob");
        carol = makeAddr("carol");
        treasury = makeAddr("treasury");
        assetAdmin = makeAddr("assetAdmin");

        nvdac = new MockNvdaC();
        usdc = new MockUsdc();
        oracle = new MockOracleAdapter(address(nvdac));
        router = new MockSwapRouter(usdc, address(nvdac));
        execution = new ExecutionAdapter(address(usdc), address(nvdac), address(router), BaseV1Constants.UNISWAP_FEE);
        marginCall = new MarginCall(address(usdc), assetAdmin);
        pool = new CreditPool(address(usdc), address(marginCall), treasury);
        marginCall.setCreditPool(address(pool));

        vm.prank(assetAdmin);
        defaultAssetId = marginCall.addAsset(address(nvdac), address(oracle), address(execution));

        usdc.mint(address(pool), DEFAULT_CREDIT);

        vm.warp(OPENED_AT);
        oracle.setObservation(IOracleAdapter.State.LIVE, BaseV1Constants.PINNED_FEED_ANSWER, 1, OPENED_AT);
        router.setLivePrice(BaseV1Constants.PINNED_FEED_ANSWER);
        assertEq(marginCall.SPOT_LEVERAGE(), SPOT_LEVERAGE, "SPOT_LEVERAGE drifted from the contract");
    }

    function _fund(address user, uint256 amount) internal {
        nvdac.mint(user, amount);
        vm.prank(user);
        nvdac.approve(address(marginCall), type(uint256).max);
    }

    function _fundUsdc(address user, uint256 amount) internal {
        usdc.mint(user, amount);
        vm.prank(user);
        usdc.approve(address(marginCall), type(uint256).max);
    }

    function _open(address user, uint256 amount) internal returns (uint256 tokenId) {
        return _openWithThesis(user, amount, "");
    }

    function _openWithThesis(address user, uint256 amount, string memory thesis) internal returns (uint256 tokenId) {
        // Use the pinned constant, not `marginCall.SPOT_LEVERAGE()`: `vm.prank` covers only the next call, so a
        // getter call here would consume the prank and `openPosition` would run as the test contract.
        vm.prank(user);
        tokenId = marginCall.openPosition(defaultAssetId, amount, SPOT_LEVERAGE, 0, thesis);
    }

    function _openFinanced(address user, uint256 amount, uint256 leverage, uint256 minOut)
        internal
        returns (uint256 tokenId)
    {
        vm.prank(user);
        tokenId = marginCall.openPosition(defaultAssetId, amount, leverage, minOut, "");
    }

    function _position(uint256 tokenId) internal view returns (MarginCall.Position memory) {
        return marginCall.positions(tokenId);
    }

    function _stockAmount(uint256 tokenId) internal view returns (uint256) {
        return _position(tokenId).stockAmount;
    }

    function _assertLiveSpotPosition(uint256 tokenId, address owner, uint256 stockAmount, uint256 openedAt)
        internal
        view
    {
        assertEq(marginCall.ownerOf(tokenId), owner);
        MarginCall.Position memory position = _position(tokenId);
        assertEq(position.assetId, defaultAssetId);
        assertEq(position.stockAmount, stockAmount);
        assertEq(position.principal, 0);
        assertEq(position.accruedInterest, 0);
        assertEq(position.lastAccruedAt, openedAt);
        assertEq(position.executor, address(0));
        assertEq(marginCall.currentDebt(tokenId), 0);
    }

    function _assertPositionDeleted(uint256 tokenId) internal view {
        _assertPositionDeletedOn(marginCall, tokenId);
    }

    function _assertPositionDeletedOn(MarginCall target, uint256 tokenId) internal view {
        MarginCall.Position memory position = target.positions(tokenId);
        assertEq(position.assetId, 0);
        assertEq(position.stockAmount, 0);
        assertEq(position.principal, 0);
        assertEq(position.accruedInterest, 0);
        assertEq(position.lastAccruedAt, 0);
        assertEq(position.executor, address(0));
        assertEq(target.currentDebt(tokenId), 0);
    }

    function _assertTokenDoesNotExist(uint256 tokenId) internal {
        _assertTokenDoesNotExistOn(marginCall, tokenId);
    }

    function _assertTokenDoesNotExistOn(MarginCall target, uint256 tokenId) internal {
        vm.expectRevert(abi.encodeWithSelector(IERC721Errors.ERC721NonexistentToken.selector, tokenId));
        target.ownerOf(tokenId);
    }

    function _expectedTokenURI(uint256 tokenId) internal pure returns (string memory) {
        return string.concat(TOKEN_URI_BASE, tokenId.toString());
    }

    function _deployStackWithStock(address stock_) internal returns (MarginCall mc, uint256 assetId) {
        address admin = makeAddr("isolatedAdmin");
        MockUsdc usdc_ = new MockUsdc();
        MockOracleAdapter oracle_ = new MockOracleAdapter(stock_);
        MockSwapRouter router_ = new MockSwapRouter(usdc_, stock_);
        ExecutionAdapter execution_ =
            new ExecutionAdapter(address(usdc_), stock_, address(router_), BaseV1Constants.UNISWAP_FEE);
        mc = new MarginCall(address(usdc_), admin);
        CreditPool pool_ = new CreditPool(address(usdc_), address(mc), makeAddr("isolatedTreasury"));
        mc.setCreditPool(address(pool_));
        vm.prank(admin);
        assetId = mc.addAsset(stock_, address(oracle_), address(execution_));
    }

    /// @dev Mirror of `MarginCall._unaccruedInterest`: simple interest at the immutable V1 APR, floored.
    function _expectedUnaccrued(uint256 principal, uint256 elapsed) internal pure returns (uint256) {
        return Math.mulDiv(
            principal,
            V1Config.BORROW_APR_BPS * elapsed,
            V1Config.BPS_DENOMINATOR * V1Config.SECONDS_PER_YEAR,
            Math.Rounding.Floor
        );
    }

    /// @dev Mirror of `MarginCall._sizePrincipal`: the ideal borrow for the preset, haircut by the adverse bound.
    function _expectedPrincipal(uint256 stockAmount, uint256 leverage) internal view returns (uint256) {
        uint256 contributionValue = oracle.valueUsdc(stockAmount, BaseV1Constants.PINNED_FEED_ANSWER);
        uint256 ideal = Math.mulDiv(contributionValue, leverage - SPOT_LEVERAGE, V1Config.BPS_DENOMINATOR);
        return Math.mulDiv(ideal, V1Config.ADVERSE_BOUND_BPS, V1Config.BPS_DENOMINATOR);
    }

    /// @dev The standard financed fixture: one 1.25x open by alice, plus the stock and debt every threshold
    ///      fixture derives its target mark from. Shared by the `liquidate` and read-surface suites so both
    ///      suites cannot disagree about what "the standard financed position" is.
    function _openFinancedFixture() internal returns (uint256 tokenId, uint256 stock, uint256 debt) {
        _fund(alice, ONE_NVDAC);
        tokenId = _openFinanced(alice, ONE_NVDAC, LEVERAGE_1_25X, 0);
        stock = _stockAmount(tokenId);
        debt = marginCall.currentDebt(tokenId);
    }

    /// @dev Deliberately *not* a mirror: the maintenance rule is shared with the contract via `V1Config` so the
    ///      RPC-free suite, the fork suite, and `MarginCall` cannot encode the 30% threshold differently. These
    ///      only assert that a fixture sits in the intended regime; the contract's verdict is proven by
    ///      `expectRevert(NotLiquidatable)` and by successful liquidation.
    function _isHealthy(uint256 nav, uint256 debt) internal pure returns (bool) {
        return V1Config.isHealthy(nav, debt);
    }

    function _isLiquidatable(uint256 nav, uint256 debt) internal pure returns (bool) {
        return V1Config.isLiquidatable(nav, debt);
    }

    /// @dev Point the mock oracle and the mock router at the same LIVE mark. Sync is the invariant: a mark the
    ///      router does not share would fill sells at a price the protocol floor never admitted.
    function _setLivePrice(uint256 price) internal {
        oracle.setObservation(IOracleAdapter.State.LIVE, price, 2, block.timestamp);
        router.setLivePrice(price);
    }

    /// @dev Crash the LIVE mark so `debt / NAV ≈ debtShareBps / 10_000` and sync the mock router's fill price.
    function _setLiveDebtSharePrice(uint256 stock, uint256 debt, uint256 debtShareBps)
        internal
        returns (uint256 price)
    {
        price = MaintenanceFixtures.priceForDebtShare(stock, debt, debtShareBps);
        _setLivePrice(price);
    }

    /// @dev `MockSwapRouter` fills sells at the protocol floor by default, so the shared fixture already is the
    ///      expectation. Delegating keeps one definition of the sell-bound formula.
    function _expectedSellOut(uint256 nvdaAmountIn, uint256 livePrice) internal pure returns (uint256) {
        return ExecutionFixtures.protocolMinUsdcOutForSell(nvdaAmountIn, livePrice);
    }

    function _expectedSellOut(uint256 nvdaAmountIn) internal pure returns (uint256) {
        return _expectedSellOut(nvdaAmountIn, BaseV1Constants.PINNED_FEED_ANSWER);
    }

    /// @dev The "nothing moved" fixture for paths that must revert atomically: position legs, derived debt, pool
    ///      credit, custody, and the owner's USDC. Shared by the `reduceExposure` and `liquidate` suites.
    struct Snapshot {
        uint256 assetId;
        uint256 stock;
        uint256 principal;
        uint256 accrued;
        uint256 lastAccrued;
        address executor;
        uint256 debt;
        uint256 poolCredit;
        uint256 custody;
        uint256 aliceUsdc;
    }

    function _snapshot(uint256 tokenId) internal view returns (Snapshot memory s) {
        MarginCall.Position memory position = _position(tokenId);
        s.assetId = position.assetId;
        s.stock = position.stockAmount;
        s.principal = position.principal;
        s.accrued = position.accruedInterest;
        s.lastAccrued = position.lastAccruedAt;
        s.executor = position.executor;
        s.debt = marginCall.currentDebt(tokenId);
        s.poolCredit = pool.availableCredit();
        s.custody = nvdac.balanceOf(address(marginCall));
        s.aliceUsdc = usdc.balanceOf(alice);
    }

    function _assertSnapshot(uint256 tokenId, Snapshot memory expected) internal view {
        MarginCall.Position memory position = _position(tokenId);
        assertEq(position.assetId, expected.assetId);
        assertEq(position.stockAmount, expected.stock);
        assertEq(position.principal, expected.principal);
        assertEq(position.accruedInterest, expected.accrued);
        assertEq(position.lastAccruedAt, expected.lastAccrued);
        assertEq(position.executor, expected.executor);
        assertEq(marginCall.currentDebt(tokenId), expected.debt);
        assertEq(pool.availableCredit(), expected.poolCredit);
        assertEq(nvdac.balanceOf(address(marginCall)), expected.custody);
        assertEq(usdc.balanceOf(alice), expected.aliceUsdc);
        assertEq(usdc.balanceOf(address(marginCall)), 0);
    }
}
