// SPDX-License-Identifier: MIT
pragma solidity 0.8.29;

import {Test} from "forge-std/Test.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";

import {BaseV1Constants} from "../test/fixtures/BaseV1Constants.sol";
import {NvdaValuation} from "../test/valuation/NvdaValuation.sol";

interface IAggregatorV3Read {
    function decimals() external view returns (uint8);
    function description() external view returns (string memory);
    function latestRoundData()
        external
        view
        returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound);
}

// Read-only subset of the verified OracleRegistry ABI, not a guessed paused(address) getter.
// https://base.blockscout.com/address/0x3f3E8cf41cdd3b1D118c16471aB0113DfDDd5CaD?tab=contract
interface ICoinbaseOracleRegistryRead {
    function getOracleParams(address token) external view returns (uint256 multiplier, bool paused);
}

interface IB20AssetRead is IERC20Metadata {
    function multiplier() external view returns (uint256);
    function scaledBalanceOf(address account) external view returns (uint256);
    function toScaledBalance(uint256 rawAmount) external view returns (uint256);
    function toRawBalance(uint256 scaledAmount) external view returns (uint256);
}

/// @dev Snapshot verification only. All writes are local to the fork.
contract BaseMainnetTest is Test {
    uint256 internal constant BASE_BLOCK = BaseV1Constants.PINNED_BLOCK;
    uint256 internal constant BASE_TIMESTAMP = BaseV1Constants.PINNED_TIMESTAMP;
    address internal constant NVDAC = BaseV1Constants.NVDAC;
    address internal constant NVDA_FEED = BaseV1Constants.NVDA_FEED;
    address internal constant REGISTRY = BaseV1Constants.COINBASE_ORACLE_REGISTRY;
    address internal constant SEQUENCER = BaseV1Constants.BASE_SEQUENCER_UPTIME_FEED;
    address internal constant USDC = BaseV1Constants.USDC;

    function setUp() public {
        vm.createSelectFork(vm.envString("BASE_MAINNET_RPC_URL"), BASE_BLOCK);
    }

    function test_pinnedBaseMainnet() public view {
        assertEq(block.chainid, BaseV1Constants.CHAIN_ID);
        assertEq(block.number, BASE_BLOCK);
        assertEq(block.timestamp, BASE_TIMESTAMP);
        assertEq(blockhash(BASE_BLOCK - 1), 0xac0ed6b214824779a5b8f953a450dba91bdbebc261b760ccb81784570646b6a4);
    }

    function test_nvdaIdentityAndDecimals() public view {
        // Native B20 marker: execution is provided by Base, not Solidity bytecode.
        assertEq(NVDAC.code, hex"ef");
        assertEq(IERC20Metadata(NVDAC).symbol(), "NVDAc");
        assertEq(IERC20Metadata(NVDAC).decimals(), BaseV1Constants.NVDAC_DECIMALS);
    }

    function test_usdcIdentityAndDecimals() public view {
        assertGt(USDC.code.length, 0);
        assertEq(IERC20Metadata(USDC).symbol(), "USDC");
        assertEq(IERC20Metadata(USDC).decimals(), BaseV1Constants.USDC_DECIMALS);
    }

    function test_b20RawAndPresentationReadsAtCurrentMultiplier() public view {
        IB20AssetRead token = IB20AssetRead(NVDAC);
        address holder = BaseV1Constants.PINNED_NVDAC_HOLDER;
        uint256 rawBalance = token.balanceOf(holder);

        assertEq(rawBalance, 79_781_200_000);
        assertEq(token.multiplier(), 1e18);
        assertEq(token.scaledBalanceOf(holder), rawBalance);
        assertEq(token.toScaledBalance(rawBalance), rawBalance);
        assertEq(token.toRawBalance(rawBalance), rawBalance);
    }

    function test_rawTransferExecutesNativeIssuerPolicy() public {
        IERC20Metadata token = IERC20Metadata(NVDAC);
        // Existing holder, discovered via Blockscout and verified at BASE_BLOCK.
        // Impersonation affects only this local fork; no key or funding is needed.
        address sender = BaseV1Constants.PINNED_NVDAC_HOLDER;
        address recipient = makeAddr("nvda-fork-recipient");
        uint256 amount = 12_345_678;
        uint256 supply = token.totalSupply();
        uint256 balanceBefore = token.balanceOf(sender);
        assertGe(balanceBefore, amount);
        assertEq(token.balanceOf(recipient), 0);

        // No storage seeding, bytecode replacement, or mocked token/policy calls.
        vm.prank(sender);
        assertTrue(token.transfer(recipient, amount));
        assertEq(token.balanceOf(sender), balanceBefore - amount);
        assertEq(token.balanceOf(recipient), amount);
        assertEq(token.totalSupply(), supply);
    }

    function test_nvdaFeedRound() public view {
        assertGt(NVDA_FEED.code.length, 0);
        IAggregatorV3Read feed = IAggregatorV3Read(NVDA_FEED);
        assertEq(feed.decimals(), BaseV1Constants.NVDA_FEED_DECIMALS);
        assertEq(feed.description(), "Coinbase NVDA");
        (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound) =
            feed.latestRoundData();
        assertGt(roundId, 0);
        assertGt(answer, 0);
        assertGt(startedAt, 0);
        assertGe(updatedAt, startedAt);
        assertLe(updatedAt, block.timestamp);
        assertGe(answeredInRound, roundId);
        // Captured snapshot, not a freshness bound or a pricing policy.
        assertEq(roundId, 36_893_488_147_419_103_594);
        assertEq(answer, 21_178_500_000);
        assertEq(startedAt, 1_789_483_930);
        assertEq(updatedAt, 1_789_483_945);
        assertEq(answeredInRound, roundId);
    }

    function test_registryNvdaOracleParams() public view {
        assertGt(REGISTRY.code.length, 0);
        (uint256 multiplier, bool paused) = ICoinbaseOracleRegistryRead(REGISTRY).getOracleParams(NVDAC);
        assertEq(multiplier, 1e18);
        assertEq(multiplier, IB20AssetRead(NVDAC).multiplier());
        assertFalse(paused);
    }

    function test_pinnedFeedValuesRawNvdaExactlyOnce() public view {
        (, int256 answer,,,) = IAggregatorV3Read(NVDA_FEED).latestRoundData();
        assertEq(answer, 21_178_500_000);
        assertEq(NvdaValuation.toUsdcRawFloor(1e8, uint256(answer)), 211_785_000);
    }

    function test_sequencerStandardAggregatorRead() public view {
        assertGt(SEQUENCER.code.length, 0);
        IAggregatorV3Read feed = IAggregatorV3Read(SEQUENCER);
        assertEq(feed.description(), "L2 Sequencer Uptime Status Feed");
        (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound) =
            feed.latestRoundData();
        assertEq(roundId, 18_446_744_073_709_551_636);
        assertEq(answer, 0);
        assertEq(startedAt, 1_782_491_507);
        assertEq(updatedAt, 1_789_491_993);
        assertEq(answeredInRound, roundId);
        assertGt(startedAt, 0);
        assertGe(updatedAt, startedAt);
        assertLe(updatedAt, block.timestamp);
    }
}
