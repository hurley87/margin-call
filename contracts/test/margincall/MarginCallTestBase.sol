// SPDX-License-Identifier: MIT
pragma solidity 0.8.29;

import {Test} from "forge-std/Test.sol";
import {Base64} from "@openzeppelin/contracts/utils/Base64.sol";
import {IERC721Errors} from "@openzeppelin/contracts/interfaces/draft-IERC6093.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";

import {BaseV1Constants} from "../fixtures/BaseV1Constants.sol";
import {MarginCall} from "../../src/MarginCall.sol";
import {MockNvdaC} from "./PositionNftTestDoubles.sol";

abstract contract MarginCallTestBase is Test {
    using Strings for uint256;

    /// @dev Asserted against `marginCall.SPOT_LEVERAGE()` in `setUp` so the literal cannot drift from the contract.
    uint256 internal constant SPOT_LEVERAGE = 10_000;
    /// @dev A deterministic nonzero open time owned by this suite. Deliberately not the fork suite's pinned block:
    ///      re-pinning that snapshot must not silently rewrite what these RPC-free assertions mean.
    uint256 internal constant OPENED_AT = 1_700_000_000;
    uint256 internal constant ONE_NVDAC = 10 ** uint256(BaseV1Constants.NVDAC_DECIMALS);
    string internal constant TOKEN_URI_PREFIX = "data:application/json;base64,";

    MockNvdaC internal nvdac;
    MarginCall internal marginCall;
    address internal alice;
    address internal bob;
    address internal carol;

    function setUp() public virtual {
        alice = makeAddr("alice");
        bob = makeAddr("bob");
        carol = makeAddr("carol");
        nvdac = new MockNvdaC();
        marginCall = new MarginCall(address(nvdac));
        vm.warp(OPENED_AT);
        assertEq(marginCall.SPOT_LEVERAGE(), SPOT_LEVERAGE, "SPOT_LEVERAGE drifted from the contract");
    }

    function _fund(address user, uint256 amount) internal {
        nvdac.mint(user, amount);
        vm.prank(user);
        nvdac.approve(address(marginCall), type(uint256).max);
    }

    function _open(address user, uint256 amount) internal returns (uint256 tokenId) {
        // Use the pinned constant, not `marginCall.SPOT_LEVERAGE()`: `vm.prank` covers only the next call, so a
        // getter call here would consume the prank and `openPosition` would run as the test contract.
        vm.prank(user);
        tokenId = marginCall.openPosition(amount, SPOT_LEVERAGE, 0);
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
        return string.concat(
            '{"name":"Margin Call Position ', tokenId.toString(), '","description":"Spot-only NVDAc Position NFT"}'
        );
    }

    function _expectedTokenURI(uint256 tokenId) internal pure returns (string memory) {
        return string.concat(TOKEN_URI_PREFIX, Base64.encode(bytes(_expectedTokenJson(tokenId))));
    }
}
