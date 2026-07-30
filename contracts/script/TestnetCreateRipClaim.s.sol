// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {console2} from "forge-std/console2.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Script} from "forge-std/Script.sol";
import {MockUSD} from "../src/MockUSD.sol";
import {PackCustody} from "../src/PackCustody.sol";
import {RipEngine} from "../src/RipEngine.sol";
import {MockPriceFeed} from "../src/mocks/MockPriceFeed.sol";
import {LaunchTokens} from "./LaunchTokens.sol";

/// @notice Live Robinhood testnet create -> enterPool -> rip -> claim (Acquisition Fees).
/// @dev Maker and Taker must differ — PackCustody.releaseToRecipient reverts SelfRelease.
contract TestnetCreateRipClaim is Script {
    uint256 internal constant PACK_AMOUNT = 1e18;
    uint256 internal constant MOCKUSD_MINT = 1_000_000e6;
    uint256 internal constant DEFAULT_TAKER_KEY = uint256(keccak256("margin-call-e2e-taker-v1"));

    PackCustody internal packs;
    RipEngine internal engine;
    MockUSD internal usd;
    address internal amzn;

    function run() external {
        uint256 makerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        uint256 takerKey = vm.envOr("E2E_TAKER_PRIVATE_KEY", DEFAULT_TAKER_KEY);
        address maker = vm.addr(makerKey);
        address taker = vm.addr(takerKey);
        require(maker != taker, "TestnetCreateRipClaim: maker and taker must differ");

        packs = PackCustody(vm.envAddress("PACKCUSTODY_ADDRESS"));
        engine = RipEngine(vm.envAddress("RIPENGINE_ADDRESS"));
        usd = MockUSD(vm.envAddress("MOCKUSD_ADDRESS"));
        amzn = LaunchTokens.tokens()[0];

        (uint256 packA, uint256 packB) = _makerSetup(makerKey, maker, taker);

        (uint256 eligible,, uint256 unitPrice, uint256 totalPayment) = engine.quoteRip(1);
        require(eligible > 1, "TestnetCreateRipClaim: need eligibleCount > count");
        console2.log("quoteRip eligible:", eligible);
        console2.log("quoteRip unitPrice:", unitPrice);
        console2.log("quoteRip totalPayment:", totalPayment);

        uint256 drawnId = _takerRip(takerKey, taker, totalPayment);
        console2.log("Drawn pack:", drawnId);
        console2.log("Taker owns drawn:", packs.ownerOf(drawnId) == taker);

        uint256 remaining = drawnId == packA ? packB : packA;
        uint256 claimed = _makerClaim(makerKey, remaining);
        console2.log("Acquisition Fee claimed (stable units):", claimed);
        require(claimed > 0, "TestnetCreateRipClaim: expected non-zero Acquisition Fee claim");
        console2.log("E2E create -> rip -> claim OK");
    }

    function _makerSetup(uint256 makerKey, address maker, address taker)
        internal
        returns (uint256 packA, uint256 packB)
    {
        vm.startBroadcast(makerKey);
        _refreshFeeds();

        if (!usd.hasRole(usd.MINTER_ROLE(), maker)) {
            require(usd.hasRole(bytes32(0), maker), "TestnetCreateRipClaim: need MockUSD admin");
            usd.grantRole(usd.MINTER_ROLE(), maker);
        }
        usd.mint(maker, MOCKUSD_MINT);
        usd.mint(taker, MOCKUSD_MINT);

        if (taker.balance < 0.001 ether) {
            (bool ok,) = taker.call{value: 0.002 ether}("");
            require(ok, "TestnetCreateRipClaim: fund taker ETH failed");
        }

        IERC20(amzn).approve(address(packs), type(uint256).max);

        address[] memory assets = new address[](1);
        uint256[] memory amounts = new uint256[](1);
        assets[0] = amzn;
        amounts[0] = PACK_AMOUNT;

        packA = packs.mint(assets, amounts);
        packB = packs.mint(assets, amounts);
        console2.log("Minted packs:", packA, packB);

        engine.enterPool(packA);
        engine.enterPool(packB);
        console2.log("Resting count:", engine.restingCount());
        vm.stopBroadcast();
    }

    function _takerRip(uint256 takerKey, address, uint256 totalPayment) internal returns (uint256 drawnId) {
        vm.startBroadcast(takerKey);
        usd.approve(address(engine), type(uint256).max);
        uint256[] memory drawn = engine.rip(1, totalPayment);
        drawnId = drawn[0];
        vm.stopBroadcast();
    }

    function _makerClaim(uint256 makerKey, uint256 remaining) internal returns (uint256 claimed) {
        require(engine.isResting(remaining), "TestnetCreateRipClaim: remaining Pack not resting");
        vm.startBroadcast(makerKey);
        uint256[] memory crystallize = new uint256[](1);
        crystallize[0] = remaining;
        claimed = engine.claim(crystallize);
        vm.stopBroadcast();
    }

    function _refreshFeeds() internal {
        for (uint256 i; i < 5; ++i) {
            string memory key = string.concat("FEED_", vm.toString(i));
            address feedAddr = vm.envOr(key, address(0));
            if (feedAddr == address(0)) continue;
            MockPriceFeed feed = MockPriceFeed(feedAddr);
            (uint256 price,,,) = feed.latestAnswer();
            feed.setPrice(price);
            console2.log("Refreshed feed", i, feedAddr);
        }
    }
}
