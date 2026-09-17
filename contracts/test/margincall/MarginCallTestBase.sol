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

    uint256 internal constant SPOT_LEVERAGE = 10_000;
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
        vm.warp(BaseV1Constants.PINNED_TIMESTAMP);
    }

    function _fund(address user, uint256 amount) internal {
        nvdac.mint(user, amount);
        vm.prank(user);
        nvdac.approve(address(marginCall), type(uint256).max);
    }

    function _open(address user, uint256 amount) internal returns (uint256 tokenId) {
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
        (uint256 stockAmount, uint256 principal, uint256 accruedInterest, uint256 lastAccruedAt, address executor) =
            _position(tokenId);
        assertEq(stockAmount, 0);
        assertEq(principal, 0);
        assertEq(accruedInterest, 0);
        assertEq(lastAccruedAt, 0);
        assertEq(executor, address(0));
        assertEq(marginCall.currentDebt(tokenId), 0);
    }

    function _assertTokenDoesNotExist(uint256 tokenId) internal {
        vm.expectRevert(abi.encodeWithSelector(IERC721Errors.ERC721NonexistentToken.selector, tokenId));
        marginCall.ownerOf(tokenId);
    }

    function _expectedTokenJson(uint256 tokenId) internal pure returns (string memory) {
        return string.concat(
            '{"name":"Margin Call Position ', tokenId.toString(), '","description":"Spot-only NVDAc Position NFT"}'
        );
    }

    function _expectedTokenURI(uint256 tokenId) internal pure returns (string memory) {
        return string.concat(TOKEN_URI_PREFIX, Base64.encode(bytes(_expectedTokenJson(tokenId))));
    }

    function _jsonFromTokenURI(string memory uri) internal pure returns (string memory) {
        bytes memory raw = bytes(uri);
        bytes memory prefix = bytes(TOKEN_URI_PREFIX);
        require(raw.length > prefix.length, "uri too short");
        bytes memory encoded = new bytes(raw.length - prefix.length);
        for (uint256 i = 0; i < encoded.length; ++i) {
            encoded[i] = raw[prefix.length + i];
        }
        return string(_decodeBase64(encoded));
    }

    function _decodeBase64(bytes memory src) internal pure returns (bytes memory result) {
        uint256 len = src.length;
        require(len % 4 == 0, "invalid base64 length");

        uint256 pad = 0;
        if (len != 0) {
            if (src[len - 1] == bytes1("=")) pad++;
            if (len > 1 && src[len - 2] == bytes1("=")) pad++;
        }

        result = new bytes((len / 4) * 3 - pad);
        uint256 outIndex;
        for (uint256 i = 0; i < len; i += 4) {
            uint256 v = (_base64Value(src[i]) << 18) | (_base64Value(src[i + 1]) << 12)
                | (_base64Value(src[i + 2]) << 6) | _base64Value(src[i + 3]);
            if (outIndex < result.length) {
                result[outIndex++] = bytes1(uint8(v >> 16));
            }
            if (outIndex < result.length) {
                result[outIndex++] = bytes1(uint8(v >> 8));
            }
            if (outIndex < result.length) {
                result[outIndex++] = bytes1(uint8(v));
            }
        }
    }

    function _base64Value(bytes1 char) private pure returns (uint256) {
        uint8 c = uint8(char);
        if (c == uint8(bytes1("="))) return 0;
        if (c >= uint8(bytes1("A")) && c <= uint8(bytes1("Z"))) return c - 65;
        if (c >= uint8(bytes1("a")) && c <= uint8(bytes1("z"))) return c - 71;
        if (c >= uint8(bytes1("0")) && c <= uint8(bytes1("9"))) return c + 4;
        if (c == uint8(bytes1("+"))) return 62;
        if (c == uint8(bytes1("/"))) return 63;
        revert("invalid base64 char");
    }
}
