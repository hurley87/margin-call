// SPDX-License-Identifier: MIT
pragma solidity 0.8.29;

import {Test} from "forge-std/Test.sol";
import {Base64} from "@openzeppelin/contracts/utils/Base64.sol";
import {IERC721Errors} from "@openzeppelin/contracts/interfaces/draft-IERC6093.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";

import {BaseV1Constants} from "../fixtures/BaseV1Constants.sol";
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
    uint256 internal constant DEFAULT_CREDIT = 1_000_000e6;
    string internal constant TOKEN_URI_PREFIX = "data:application/json;base64,";

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

    function setUp() public virtual {
        alice = makeAddr("alice");
        bob = makeAddr("bob");
        carol = makeAddr("carol");

        nvdac = new MockNvdaC();
        usdc = new MockUsdc();
        oracle = new MockOracleAdapter();
        router = new MockSwapRouter(usdc, nvdac);
        execution = new ExecutionAdapter(address(usdc), address(nvdac), address(router), BaseV1Constants.UNISWAP_FEE);
        marginCall = new MarginCall(address(nvdac), address(usdc), address(oracle), address(execution));
        pool = new CreditPool(address(usdc), address(marginCall));
        marginCall.setCreditPool(address(pool));

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
        // Use the pinned constant, not `marginCall.SPOT_LEVERAGE()`: `vm.prank` covers only the next call, so a
        // getter call here would consume the prank and `openPosition` would run as the test contract.
        vm.prank(user);
        tokenId = marginCall.openPosition(amount, SPOT_LEVERAGE, 0);
    }

    function _openFinanced(address user, uint256 amount, uint256 leverage, uint256 minOut)
        internal
        returns (uint256 tokenId)
    {
        vm.prank(user);
        tokenId = marginCall.openPosition(amount, leverage, minOut);
    }

    function _position(uint256 tokenId)
        internal
        view
        returns (
            uint256 stockAmount,
            uint256 principal,
            uint256 accruedInterest,
            uint256 lastAccruedAt,
            address executor
        )
    {
        return marginCall.positions(tokenId);
    }

    function _assertLiveSpotPosition(uint256 tokenId, address owner, uint256 stockAmount, uint256 openedAt)
        internal
        view
    {
        assertEq(marginCall.ownerOf(tokenId), owner);
        (uint256 recordedStock, uint256 principal, uint256 accruedInterest, uint256 lastAccruedAt, address executor) =
            _position(tokenId);
        assertEq(recordedStock, stockAmount);
        assertEq(principal, 0);
        assertEq(accruedInterest, 0);
        assertEq(lastAccruedAt, openedAt);
        assertEq(executor, address(0));
        assertEq(marginCall.currentDebt(tokenId), 0);
    }

    function _assertPositionDeleted(uint256 tokenId) internal view {
        _assertPositionDeletedOn(marginCall, tokenId);
    }

    function _assertPositionDeletedOn(MarginCall target, uint256 tokenId) internal view {
        (uint256 stockAmount, uint256 principal, uint256 accruedInterest, uint256 lastAccruedAt, address executor) =
            target.positions(tokenId);
        assertEq(stockAmount, 0);
        assertEq(principal, 0);
        assertEq(accruedInterest, 0);
        assertEq(lastAccruedAt, 0);
        assertEq(executor, address(0));
        assertEq(target.currentDebt(tokenId), 0);
    }

    function _assertTokenDoesNotExist(uint256 tokenId) internal {
        _assertTokenDoesNotExistOn(marginCall, tokenId);
    }

    function _assertTokenDoesNotExistOn(MarginCall target, uint256 tokenId) internal {
        vm.expectRevert(abi.encodeWithSelector(IERC721Errors.ERC721NonexistentToken.selector, tokenId));
        target.ownerOf(tokenId);
    }

    function _expectedTokenJson(uint256 tokenId) internal pure returns (string memory) {
        return
            string.concat('{"name":"Margin Call Position ', tokenId.toString(), '","description":"NVDAc Position NFT"}');
    }

    function _expectedTokenURI(uint256 tokenId) internal pure returns (string memory) {
        return string.concat(TOKEN_URI_PREFIX, Base64.encode(bytes(_expectedTokenJson(tokenId))));
    }

    function _deployStackWithNvda(address nvdac_) internal returns (MarginCall mc) {
        MockUsdc usdc_ = new MockUsdc();
        MockOracleAdapter oracle_ = new MockOracleAdapter();
        MockNvdaC inventory = new MockNvdaC();
        MockSwapRouter router_ = new MockSwapRouter(usdc_, inventory);
        ExecutionAdapter execution_ =
            new ExecutionAdapter(address(usdc_), nvdac_, address(router_), BaseV1Constants.UNISWAP_FEE);
        mc = new MarginCall(nvdac_, address(usdc_), address(oracle_), address(execution_));
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
}
