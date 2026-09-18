// SPDX-License-Identifier: MIT
pragma solidity 0.8.29;

import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {IERC20Errors, IERC721Errors} from "@openzeppelin/contracts/interfaces/draft-IERC6093.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import {MarginCall} from "../../src/MarginCall.sol";
import {V1Config} from "../../src/V1Config.sol";
import {MarginCallTestBase} from "./MarginCallTestBase.sol";
import {FalseReturningNvdaC, RevertingNvdaC} from "./PositionNftTestDoubles.sol";

/// @dev RPC-free coverage for the spot-only Position NFT lifecycle, custody, and ERC-721 semantics.
contract MarginCallTest is MarginCallTestBase {
    function test_constructorRejectsZeroUsdc() public {
        vm.expectRevert(MarginCall.ZeroAddress.selector);
        new MarginCall(address(0), assetAdmin);
    }

    function test_constructorRejectsZeroAssetAdmin() public {
        vm.expectRevert(MarginCall.ZeroAddress.selector);
        new MarginCall(address(usdc), address(0));
    }

    function test_openInspectCloseSpotLifecycle() public {
        uint256 deposit = 5 * ONE_NVDAC;
        _fund(alice, deposit);

        uint256 aliceBefore = nvdac.balanceOf(alice);
        uint256 custodyBefore = nvdac.balanceOf(address(marginCall));

        vm.expectEmit(true, true, true, true, address(marginCall));
        emit MarginCall.PositionOpened(1, alice, defaultAssetId, deposit);
        vm.expectEmit(true, true, true, true, address(marginCall));
        emit IERC721.Transfer(address(0), alice, 1);

        uint256 tokenId = _open(alice, deposit);

        assertEq(tokenId, 1);
        assertEq(marginCall.balanceOf(alice), 1);
        _assertLiveSpotPosition(tokenId, alice, deposit, OPENED_AT);
        assertEq(nvdac.balanceOf(address(marginCall)), custodyBefore + deposit);
        assertEq(nvdac.balanceOf(alice), aliceBefore - deposit);

        vm.expectEmit(true, true, true, true, address(marginCall));
        emit IERC721.Transfer(alice, address(0), tokenId);
        vm.expectEmit(true, true, false, true, address(marginCall));
        emit MarginCall.PositionClosed(tokenId, alice, deposit);

        vm.prank(alice);
        marginCall.closePosition(tokenId);

        _assertTokenDoesNotExist(tokenId);
        _assertPositionDeleted(tokenId);
        assertEq(marginCall.balanceOf(alice), 0);
        assertEq(nvdac.balanceOf(address(marginCall)), custodyBefore);
        assertEq(nvdac.balanceOf(alice), aliceBefore);
    }

    function test_zeroStockAmountReverts() public {
        _fund(alice, ONE_NVDAC);
        vm.prank(alice);
        vm.expectRevert(MarginCall.ZeroStockAmount.selector);
        marginCall.openPosition(defaultAssetId, 0, SPOT_LEVERAGE, 0);
    }

    function test_leverageBelowOneTimesReverts() public {
        _fund(alice, ONE_NVDAC);

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(MarginCall.UnsupportedLeverage.selector, 0));
        marginCall.openPosition(defaultAssetId, ONE_NVDAC, 0, 0);

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(MarginCall.UnsupportedLeverage.selector, 9_999));
        marginCall.openPosition(defaultAssetId, ONE_NVDAC, 9_999, 0);
    }

    function test_leverageAboveMaxReverts() public {
        _fund(alice, ONE_NVDAC);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(MarginCall.UnsupportedLeverage.selector, 15_001));
        marginCall.openPosition(defaultAssetId, ONE_NVDAC, 15_001, 0);
    }

    function test_intermediateLeverageReverts() public {
        _fund(alice, 4 * ONE_NVDAC);
        uint256[4] memory invalid = [uint256(10_001), 11_500, 13_000, 14_999];
        for (uint256 i = 0; i < invalid.length; ++i) {
            vm.prank(alice);
            vm.expectRevert(abi.encodeWithSelector(MarginCall.UnsupportedLeverage.selector, invalid[i]));
            marginCall.openPosition(defaultAssetId, ONE_NVDAC, invalid[i], 0);
        }
        assertEq(nvdac.balanceOf(alice), 4 * ONE_NVDAC);
        assertEq(nvdac.balanceOf(address(marginCall)), 0);
        assertEq(marginCall.balanceOf(alice), 0);
    }

    function test_nonzeroMinStockOutReverts() public {
        _fund(alice, ONE_NVDAC);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(MarginCall.InvalidMinStockOut.selector, 1));
        marginCall.openPosition(defaultAssetId, ONE_NVDAC, SPOT_LEVERAGE, 1);
    }

    /// @dev `_requireLeverageWithinCeiling` checks only `targetLeverage`, which is sound because the preset set is
    ///      bounded by the advertised ceiling. Pin that here so adding a higher preset fails loudly.
    function test_everySupportedPresetIsWithinTheAdvertisedCeiling() public view {
        uint256[5] memory presets = [SPOT_LEVERAGE, LEVERAGE_1_1X, LEVERAGE_1_25X, LEVERAGE_1_4X, LEVERAGE_1_5X];
        for (uint256 i = 0; i < presets.length; ++i) {
            assertTrue(V1Config.isSupportedOpeningLeverage(presets[i]), "preset dropped out of the supported set");
            assertLe(presets[i], marginCall.MAX_OPENING_LEVERAGE(), "preset exceeds MAX_OPENING_LEVERAGE");
        }
        assertEq(marginCall.MAX_OPENING_LEVERAGE(), LEVERAGE_1_5X, "advertised ceiling drifted");
    }

    function test_validSpotPresetAndZeroMinStockOutSucceeds() public {
        _fund(alice, ONE_NVDAC);
        uint256 tokenId = _open(alice, ONE_NVDAC);
        assertEq(tokenId, 1);
        _assertLiveSpotPosition(tokenId, alice, ONE_NVDAC, OPENED_AT);
    }

    function testFuzz_unsupportedLeverageReverts(uint256 leverage) public {
        vm.assume(!V1Config.isSupportedOpeningLeverage(leverage));
        _fund(alice, ONE_NVDAC);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(MarginCall.UnsupportedLeverage.selector, leverage));
        marginCall.openPosition(defaultAssetId, ONE_NVDAC, leverage, 0);
    }

    function testFuzz_nonzeroMinStockOutReverts(uint256 minStockOut) public {
        vm.assume(minStockOut != 0);
        _fund(alice, ONE_NVDAC);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(MarginCall.InvalidMinStockOut.selector, minStockOut));
        marginCall.openPosition(defaultAssetId, ONE_NVDAC, SPOT_LEVERAGE, minStockOut);
    }

    function test_unauthorizedCloseRevertsAndLeavesState() public {
        uint256 deposit = 2 * ONE_NVDAC;
        _fund(alice, deposit);
        uint256 tokenId = _open(alice, deposit);
        uint256 custody = nvdac.balanceOf(address(marginCall));

        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(MarginCall.NotPositionOwner.selector, bob, alice));
        marginCall.closePosition(tokenId);

        _assertLiveSpotPosition(tokenId, alice, deposit, OPENED_AT);
        assertEq(nvdac.balanceOf(address(marginCall)), custody);
        assertEq(nvdac.balanceOf(alice), 0);
    }

    function test_erc721ApprovalDoesNotAuthorizeClose() public {
        uint256 deposit = ONE_NVDAC;
        _fund(alice, deposit);
        uint256 tokenId = _open(alice, deposit);

        vm.prank(alice);
        marginCall.approve(bob, tokenId);
        assertEq(marginCall.getApproved(tokenId), bob);

        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(MarginCall.NotPositionOwner.selector, bob, alice));
        marginCall.closePosition(tokenId);

        vm.prank(alice);
        marginCall.setApprovalForAll(bob, true);
        assertTrue(marginCall.isApprovedForAll(alice, bob));

        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(MarginCall.NotPositionOwner.selector, bob, alice));
        marginCall.closePosition(tokenId);

        _assertLiveSpotPosition(tokenId, alice, deposit, OPENED_AT);
        assertEq(nvdac.balanceOf(address(marginCall)), deposit);
    }

    function test_sharedCustodyIsolationBetweenOwners() public {
        uint256 aliceAmount = 3 * ONE_NVDAC;
        uint256 bobAmount = 7 * ONE_NVDAC;
        _fund(alice, aliceAmount);
        _fund(bob, bobAmount);

        uint256 tokenA = _open(alice, aliceAmount);
        uint256 tokenB = _open(bob, bobAmount);

        (, uint256 stockA,,,,) = _position(tokenA);
        (, uint256 stockB,,,,) = _position(tokenB);
        assertEq(stockA, aliceAmount);
        assertEq(stockB, bobAmount);
        assertEq(stockA + stockB, nvdac.balanceOf(address(marginCall)));
        assertEq(marginCall.ownerOf(tokenA), alice);
        assertEq(marginCall.ownerOf(tokenB), bob);

        uint256 bobNvdacBefore = nvdac.balanceOf(bob);
        vm.prank(alice);
        marginCall.closePosition(tokenA);

        _assertTokenDoesNotExist(tokenA);
        _assertPositionDeleted(tokenA);
        _assertLiveSpotPosition(tokenB, bob, bobAmount, OPENED_AT);
        assertEq(nvdac.balanceOf(alice), aliceAmount);
        assertEq(nvdac.balanceOf(bob), bobNvdacBefore);
        assertEq(nvdac.balanceOf(address(marginCall)), bobAmount);

        vm.prank(bob);
        marginCall.closePosition(tokenB);

        _assertTokenDoesNotExist(tokenB);
        _assertPositionDeleted(tokenB);
        assertEq(nvdac.balanceOf(bob), bobNvdacBefore + bobAmount);
        assertEq(nvdac.balanceOf(address(marginCall)), 0);
    }

    function test_unsolicitedNvdaDoesNotIncreaseClosePayout() public {
        uint256 aliceAmount = 4 * ONE_NVDAC;
        uint256 bobAmount = 6 * ONE_NVDAC;
        uint256 extra = 11 * ONE_NVDAC;
        _fund(alice, aliceAmount);
        _fund(bob, bobAmount);

        uint256 tokenA = _open(alice, aliceAmount);
        uint256 tokenB = _open(bob, bobAmount);
        nvdac.mint(address(marginCall), extra);

        uint256 custody = nvdac.balanceOf(address(marginCall));
        (, uint256 stockA,,,,) = _position(tokenA);
        (, uint256 stockB,,,,) = _position(tokenB);
        assertEq(stockA + stockB + extra, custody);

        vm.prank(alice);
        marginCall.closePosition(tokenA);

        assertEq(nvdac.balanceOf(alice), aliceAmount);
        _assertLiveSpotPosition(tokenB, bob, bobAmount, OPENED_AT);
        assertEq(nvdac.balanceOf(address(marginCall)), bobAmount + extra);

        vm.prank(bob);
        marginCall.closePosition(tokenB);

        assertEq(nvdac.balanceOf(bob), bobAmount);
        assertEq(nvdac.balanceOf(address(marginCall)), extra);
    }

    function test_sameOwnerCanOpenMultiplePositions() public {
        _fund(alice, 10 * ONE_NVDAC);
        uint256 first = _open(alice, 3 * ONE_NVDAC);
        uint256 second = _open(alice, 7 * ONE_NVDAC);

        assertEq(first, 1);
        assertEq(second, 2);
        assertEq(marginCall.balanceOf(alice), 2);
        _assertLiveSpotPosition(first, alice, 3 * ONE_NVDAC, OPENED_AT);
        _assertLiveSpotPosition(second, alice, 7 * ONE_NVDAC, OPENED_AT);
        assertEq(nvdac.balanceOf(address(marginCall)), 10 * ONE_NVDAC);

        vm.prank(alice);
        marginCall.closePosition(first);

        _assertTokenDoesNotExist(first);
        _assertLiveSpotPosition(second, alice, 7 * ONE_NVDAC, OPENED_AT);
        assertEq(marginCall.balanceOf(alice), 1);
        assertEq(nvdac.balanceOf(alice), 3 * ONE_NVDAC);
        assertEq(nvdac.balanceOf(address(marginCall)), 7 * ONE_NVDAC);
    }

    function test_tokenIdsRemainUniqueAcrossSuccessfulOpens() public {
        _fund(alice, 3 * ONE_NVDAC);
        uint256 first = _open(alice, ONE_NVDAC);
        uint256 second = _open(alice, ONE_NVDAC);

        vm.prank(alice);
        marginCall.closePosition(first);

        uint256 third = _open(alice, ONE_NVDAC);
        assertEq(first, 1);
        assertEq(second, 2);
        assertEq(third, 3);
        _assertTokenDoesNotExist(first);
        _assertLiveSpotPosition(second, alice, ONE_NVDAC, OPENED_AT);
        _assertLiveSpotPosition(third, alice, ONE_NVDAC, OPENED_AT);
    }

    function test_closeNonexistentTokenReverts() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(IERC721Errors.ERC721NonexistentToken.selector, 1));
        marginCall.closePosition(1);
    }

    function test_closeBurnedTokenTwiceReverts() public {
        _fund(alice, ONE_NVDAC);
        uint256 tokenId = _open(alice, ONE_NVDAC);

        vm.prank(alice);
        marginCall.closePosition(tokenId);

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(IERC721Errors.ERC721NonexistentToken.selector, tokenId));
        marginCall.closePosition(tokenId);
    }

    function test_transferPreservesAccountingAndMovesCloseRights() public {
        uint256 deposit = 8 * ONE_NVDAC;
        _fund(alice, deposit);
        uint256 tokenId = _open(alice, deposit);

        vm.expectEmit(true, true, true, true, address(marginCall));
        emit IERC721.Transfer(alice, bob, tokenId);
        vm.prank(alice);
        marginCall.transferFrom(alice, bob, tokenId);

        assertEq(marginCall.ownerOf(tokenId), bob);
        assertEq(marginCall.balanceOf(alice), 0);
        assertEq(marginCall.balanceOf(bob), 1);
        _assertLiveSpotPosition(tokenId, bob, deposit, OPENED_AT);
        assertEq(nvdac.balanceOf(address(marginCall)), deposit);
        assertEq(nvdac.balanceOf(alice), 0);

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(MarginCall.NotPositionOwner.selector, alice, bob));
        marginCall.closePosition(tokenId);

        vm.prank(bob);
        marginCall.closePosition(tokenId);

        _assertTokenDoesNotExist(tokenId);
        _assertPositionDeleted(tokenId);
        assertEq(nvdac.balanceOf(bob), deposit);
        assertEq(nvdac.balanceOf(alice), 0);
        assertEq(nvdac.balanceOf(address(marginCall)), 0);
    }

    function test_approvedOperatorCanTransferButStillCannotClose() public {
        uint256 deposit = ONE_NVDAC;
        _fund(alice, deposit);
        uint256 tokenId = _open(alice, deposit);

        vm.prank(alice);
        marginCall.approve(bob, tokenId);

        vm.prank(bob);
        marginCall.transferFrom(alice, carol, tokenId);

        assertEq(marginCall.ownerOf(tokenId), carol);
        _assertLiveSpotPosition(tokenId, carol, deposit, OPENED_AT);

        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(MarginCall.NotPositionOwner.selector, bob, carol));
        marginCall.closePosition(tokenId);

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(MarginCall.NotPositionOwner.selector, alice, carol));
        marginCall.closePosition(tokenId);

        vm.prank(carol);
        marginCall.closePosition(tokenId);
        assertEq(nvdac.balanceOf(carol), deposit);
    }

    function test_liveTokenURIIsValidIdentityMetadata() public {
        _fund(alice, ONE_NVDAC);
        uint256 tokenId = _open(alice, ONE_NVDAC);

        // `_expectedTokenURI` is `TOKEN_URI_PREFIX + Base64.encode(_expectedTokenJson)`, so this single
        // equality pins the prefix, the encoding, and the payload; the JSON shape is asserted on the payload.
        assertEq(marginCall.tokenURI(tokenId), _expectedTokenURI(tokenId));

        string memory json = _expectedTokenJson(tokenId);
        assertEq(vm.parseJsonString(json, ".name"), "Margin Call Position 1");
        assertEq(vm.parseJsonString(json, ".description"), "Margin Call Position NFT");
        vm.parseJson(json);
    }

    function test_tokenURIRevertsAfterBurn() public {
        _fund(alice, ONE_NVDAC);
        uint256 tokenId = _open(alice, ONE_NVDAC);
        vm.prank(alice);
        marginCall.closePosition(tokenId);

        vm.expectRevert(abi.encodeWithSelector(IERC721Errors.ERC721NonexistentToken.selector, tokenId));
        marginCall.tokenURI(tokenId);
    }

    function test_openRevertsWhenFalseReturningTransferFrom() public {
        FalseReturningNvdaC token = new FalseReturningNvdaC();
        (MarginCall isolated, uint256 assetId) = _deployStackWithStock(address(token));
        vm.prank(alice);
        token.approve(address(isolated), ONE_NVDAC);

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(SafeERC20.SafeERC20FailedOperation.selector, address(token)));
        isolated.openPosition(assetId, ONE_NVDAC, SPOT_LEVERAGE, 0);

        _assertTokenDoesNotExistOn(isolated, 1);
        _assertPositionDeletedOn(isolated, 1);
        assertEq(isolated.balanceOf(alice), 0);
    }

    function test_openRevertsWhenTransferFromReverts() public {
        RevertingNvdaC token = new RevertingNvdaC();
        (MarginCall isolated, uint256 assetId) = _deployStackWithStock(address(token));
        vm.prank(alice);
        token.approve(address(isolated), ONE_NVDAC);

        vm.prank(alice);
        vm.expectRevert(RevertingNvdaC.TransferFailed.selector);
        isolated.openPosition(assetId, ONE_NVDAC, SPOT_LEVERAGE, 0);

        _assertTokenDoesNotExistOn(isolated, 1);
        _assertPositionDeletedOn(isolated, 1);
        assertEq(isolated.balanceOf(alice), 0);
    }

    function test_openRevertsWhenAllowanceMissing() public {
        nvdac.mint(alice, ONE_NVDAC);
        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(IERC20Errors.ERC20InsufficientAllowance.selector, address(marginCall), 0, ONE_NVDAC)
        );
        marginCall.openPosition(defaultAssetId, ONE_NVDAC, SPOT_LEVERAGE, 0);

        _assertTokenDoesNotExist(1);
        _assertPositionDeleted(1);
        assertEq(nvdac.balanceOf(alice), ONE_NVDAC);
        assertEq(nvdac.balanceOf(address(marginCall)), 0);
    }

    function testFuzz_openCloseReturnsExactStock(uint256 deposit) public {
        deposit = _bound(deposit, 1, 1_000 * ONE_NVDAC);
        _fund(alice, deposit);

        uint256 tokenId = _open(alice, deposit);
        (, uint256 recordedStock,,,,) = _position(tokenId);
        assertEq(recordedStock, deposit);
        assertEq(nvdac.balanceOf(address(marginCall)), deposit);

        vm.prank(alice);
        marginCall.closePosition(tokenId);

        _assertTokenDoesNotExist(tokenId);
        _assertPositionDeleted(tokenId);
        assertEq(nvdac.balanceOf(alice), deposit);
        assertEq(nvdac.balanceOf(address(marginCall)), 0);
    }

    function testFuzz_closeDoesNotConsumeOtherPositionStock(uint256 aliceAmount, uint256 bobAmount, uint256 extra)
        public
    {
        aliceAmount = _bound(aliceAmount, 1, 500 * ONE_NVDAC);
        bobAmount = _bound(bobAmount, 1, 500 * ONE_NVDAC);
        extra = _bound(extra, 0, 100 * ONE_NVDAC);

        _fund(alice, aliceAmount);
        _fund(bob, bobAmount);
        uint256 tokenA = _open(alice, aliceAmount);
        uint256 tokenB = _open(bob, bobAmount);
        if (extra != 0) {
            nvdac.mint(address(marginCall), extra);
        }

        (, uint256 stockA,,,,) = _position(tokenA);
        (, uint256 stockB,,,,) = _position(tokenB);
        assertEq(stockA + stockB + extra, nvdac.balanceOf(address(marginCall)));

        vm.prank(alice);
        marginCall.closePosition(tokenA);

        assertEq(nvdac.balanceOf(alice), aliceAmount);
        (, uint256 remainingB,,,,) = _position(tokenB);
        assertEq(remainingB, bobAmount);
        assertEq(marginCall.ownerOf(tokenB), bob);
        assertEq(nvdac.balanceOf(address(marginCall)), bobAmount + extra);

        vm.prank(bob);
        marginCall.closePosition(tokenB);
        assertEq(nvdac.balanceOf(bob), bobAmount);
        assertEq(nvdac.balanceOf(address(marginCall)), extra);
    }

    function testFuzz_recordedStockNeverExceedsCustody(uint256 aAmount, uint256 bAmount, uint256 cAmount) public {
        aAmount = _bound(aAmount, 1, 250 * ONE_NVDAC);
        bAmount = _bound(bAmount, 1, 250 * ONE_NVDAC);
        cAmount = _bound(cAmount, 1, 250 * ONE_NVDAC);

        _fund(alice, aAmount);
        _fund(bob, bAmount);
        _fund(carol, cAmount);
        uint256 tokenA = _open(alice, aAmount);
        uint256 tokenB = _open(bob, bAmount);
        uint256 tokenC = _open(carol, cAmount);

        (, uint256 stockA,,,,) = _position(tokenA);
        (, uint256 stockB,,,,) = _position(tokenB);
        (, uint256 stockC,,,,) = _position(tokenC);
        uint256 recorded = stockA + stockB + stockC;
        assertEq(recorded, nvdac.balanceOf(address(marginCall)));

        vm.prank(bob);
        marginCall.closePosition(tokenB);
        (, stockA,,,,) = _position(tokenA);
        (, stockC,,,,) = _position(tokenC);
        recorded = stockA + stockC;
        assertEq(recorded, nvdac.balanceOf(address(marginCall)));
        _assertLiveSpotPosition(tokenA, alice, aAmount, OPENED_AT);
        _assertLiveSpotPosition(tokenC, carol, cAmount, OPENED_AT);
    }
}
