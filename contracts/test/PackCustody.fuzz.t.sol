// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {PackCustody} from "../src/PackCustody.sol";
import {MockStockToken} from "./mocks/MockStockToken.sol";
import {PackCustodyFixture} from "./helpers/PackCustodyFixture.sol";

/// @notice Conservation over arbitrary baskets: whatever went in comes back out, across every
///         combination of the whitelisted assets and their differing decimals.
contract PackCustodyFuzzTest is PackCustodyFixture {
    /// @dev Builds a basket from a bitmask over the whitelist, so every subset gets exercised.
    function _maskedBasket(uint8 maskSeed, uint256 amountSeed)
        internal
        view
        returns (address[] memory assets, uint256[] memory amounts)
    {
        uint256 mask = bound(uint256(maskSeed), 1, (1 << 5) - 1);

        uint256 count;
        for (uint256 i; i < 5; ++i) {
            if (mask & (1 << i) != 0) ++count;
        }

        assets = new address[](count);
        amounts = new uint256[](count);

        uint256 cursor;
        for (uint256 i; i < 5; ++i) {
            if (mask & (1 << i) == 0) continue;

            address asset = whitelist[i];
            uint256 unit = 10 ** MockStockToken(asset).decimals();
            uint256 raw = uint256(keccak256(abi.encode(amountSeed, i)));

            assets[cursor] = asset;
            // Bounded well below the funded balance so top-ups always have headroom.
            amounts[cursor] = bound(raw, 1, 1000 * unit);
            ++cursor;
        }
    }

    function _balances(address who) internal view returns (uint256[5] memory out) {
        for (uint256 i; i < 5; ++i) {
            out[i] = MockStockToken(whitelist[i]).balanceOf(who);
        }
    }

    function _assertBalances(address who, uint256[5] memory expected) internal view {
        for (uint256 i; i < 5; ++i) {
            assertEq(MockStockToken(whitelist[i]).balanceOf(who), expected[i]);
        }
    }

    // ========== Deposit accounting ==========

    function testFuzz_mintRecordsExactlyWhatCustodyReceived(uint8 maskSeed, uint256 amountSeed) public {
        (address[] memory assets, uint256[] memory amounts) = _maskedBasket(maskSeed, amountSeed);

        vm.prank(creator);
        uint256 tokenId = packs.mint(assets, amounts);

        PackCustody.BasketEntry[] memory basket = packs.basketOf(tokenId);
        assertEq(basket.length, assets.length);

        for (uint256 i; i < assets.length; ++i) {
            assertEq(basket[i].asset, assets[i]);
            assertEq(basket[i].amount, amounts[i]);
            assertEq(MockStockToken(assets[i]).balanceOf(address(packs)), amounts[i]);
        }
    }

    // ========== Round trips ==========

    function testFuzz_mintThenRedeemIsABalanceNeutralRoundTrip(uint8 maskSeed, uint256 amountSeed) public {
        uint256[5] memory start = _balances(creator);

        (address[] memory assets, uint256[] memory amounts) = _maskedBasket(maskSeed, amountSeed);

        vm.startPrank(creator);
        uint256 tokenId = packs.mint(assets, amounts);
        packs.delistAndRedeem(tokenId);
        vm.stopPrank();

        _assertBalances(creator, start);
        for (uint256 i; i < 5; ++i) {
            assertEq(MockStockToken(whitelist[i]).balanceOf(address(packs)), 0);
        }
    }

    function testFuzz_mintTransferUnwrapMovesTheWholeBasketToTheHolder(uint8 maskSeed, uint256 amountSeed) public {
        uint256[5] memory creatorStart = _balances(creator);
        uint256[5] memory buyerStart = _balances(buyer);

        (address[] memory assets, uint256[] memory amounts) = _maskedBasket(maskSeed, amountSeed);

        vm.startPrank(creator);
        uint256 tokenId = packs.mint(assets, amounts);
        packs.transferFrom(creator, buyer, tokenId);
        vm.stopPrank();

        vm.prank(buyer);
        packs.unwrap(tokenId);

        // Every unit the creator spent arrives with the holder, and none is retained.
        for (uint256 i; i < 5; ++i) {
            address asset = whitelist[i];
            uint256 spent = creatorStart[i] - MockStockToken(asset).balanceOf(creator);
            uint256 gained = MockStockToken(asset).balanceOf(buyer) - buyerStart[i];

            assertEq(gained, spent);
            assertEq(MockStockToken(asset).balanceOf(address(packs)), 0);
        }
    }

    function testFuzz_topUpsAccumulateAndRedeemReturnsTheTotal(
        uint8 mintMask,
        uint256 mintSeed,
        uint8 topUpMask,
        uint256 topUpSeed
    ) public {
        uint256[5] memory start = _balances(creator);

        (address[] memory mintAssets, uint256[] memory mintAmounts) = _maskedBasket(mintMask, mintSeed);
        (address[] memory addAssets, uint256[] memory addAmounts) = _maskedBasket(topUpMask, topUpSeed);

        vm.startPrank(creator);
        uint256 tokenId = packs.mint(mintAssets, mintAmounts);
        packs.topUp(tokenId, addAssets, addAmounts);

        // Every deposit is still recorded, summed per asset.
        for (uint256 i; i < addAssets.length; ++i) {
            uint256 expected = addAmounts[i];
            for (uint256 j; j < mintAssets.length; ++j) {
                if (mintAssets[j] == addAssets[i]) expected += mintAmounts[j];
            }
            assertEq(packs.basketAmountOf(tokenId, addAssets[i]), expected);
        }

        packs.delistAndRedeem(tokenId);
        vm.stopPrank();

        _assertBalances(creator, start);
    }

    function testFuzz_repeatedTopUpsNeverReduceARecordedAmount(uint8 maskSeed, uint256 amountSeed, uint8 rounds)
        public
    {
        uint256 roundCount = bound(uint256(rounds), 1, 8);

        (address[] memory assets, uint256[] memory amounts) = _maskedBasket(maskSeed, amountSeed);

        vm.startPrank(creator);
        uint256 tokenId = packs.mint(assets, amounts);

        uint256[] memory previous = new uint256[](assets.length);
        for (uint256 i; i < assets.length; ++i) {
            previous[i] = packs.basketAmountOf(tokenId, assets[i]);
        }

        for (uint256 round; round < roundCount; ++round) {
            packs.topUp(tokenId, assets, amounts);

            for (uint256 i; i < assets.length; ++i) {
                uint256 current = packs.basketAmountOf(tokenId, assets[i]);
                assertGe(current, previous[i]);
                previous[i] = current;
            }
        }
        vm.stopPrank();
    }

    // ========== Isolation ==========

    function testFuzz_packsDoNotDrawOnEachOthersCustody(uint8 maskSeed, uint256 amountSeed) public {
        (address[] memory assets, uint256[] memory amounts) = _maskedBasket(maskSeed, amountSeed);

        vm.prank(creator);
        uint256 first = packs.mint(assets, amounts);

        vm.prank(otherCreator);
        uint256 second = packs.mint(assets, amounts);

        uint256[5] memory otherStart = _balances(otherCreator);

        vm.prank(creator);
        packs.delistAndRedeem(first);

        // Redeeming one Pack leaves the other's recorded basket and its backing intact.
        for (uint256 i; i < assets.length; ++i) {
            assertEq(packs.basketAmountOf(second, assets[i]), amounts[i]);
            assertEq(MockStockToken(assets[i]).balanceOf(address(packs)), amounts[i]);
        }

        vm.prank(otherCreator);
        packs.delistAndRedeem(second);

        for (uint256 i; i < assets.length; ++i) {
            assertEq(MockStockToken(assets[i]).balanceOf(address(packs)), 0);
        }
        for (uint256 i; i < 5; ++i) {
            assertGe(MockStockToken(whitelist[i]).balanceOf(otherCreator), otherStart[i]);
        }
    }

    function testFuzz_releasingOnePackNeverDrawsOnAnothersBasket(uint8 maskSeed, uint256 amountSeed) public {
        _grantRipEngine();

        (address[] memory assets, uint256[] memory amounts) = _maskedBasket(maskSeed, amountSeed);

        vm.prank(creator);
        uint256 first = packs.mint(assets, amounts);

        vm.prank(otherCreator);
        uint256 second = packs.mint(assets, amounts);

        vm.prank(ripEngine);
        packs.releaseToRecipient(first, buyer);

        for (uint256 i; i < assets.length; ++i) {
            assertEq(packs.basketAmountOf(first, assets[i]), amounts[i]);
            assertEq(packs.basketAmountOf(second, assets[i]), amounts[i]);
            assertEq(MockStockToken(assets[i]).balanceOf(address(packs)), amounts[i] * 2);
        }

        vm.prank(buyer);
        packs.unwrap(first);

        for (uint256 i; i < assets.length; ++i) {
            assertEq(packs.basketAmountOf(second, assets[i]), amounts[i]);
            assertEq(MockStockToken(assets[i]).balanceOf(address(packs)), amounts[i]);
        }
    }
}
