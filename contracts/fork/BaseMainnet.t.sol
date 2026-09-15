// SPDX-License-Identifier: MIT
pragma solidity 0.8.29;

import {Test} from "forge-std/Test.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";

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

/// @dev Snapshot verification only. All writes are local to the fork.
contract BaseMainnetTest is Test {
    uint256 internal constant BASE_BLOCK = 51_356_323;
    uint256 internal constant BASE_TIMESTAMP = 1_789_501_993;
    address internal constant NVDAC = 0xb20000000000000000000078ee7ce2fE4908108C;
    address internal constant NVDA_FEED = 0x04689a41629776563E6822F76f2e57D148d28513;
    address internal constant REGISTRY = 0x3f3E8cf41cdd3b1D118c16471aB0113DfDDd5CaD;
    address internal constant SEQUENCER = 0xBCF85224fc0756B9Fa45aA7892530B47e10b6433;

    function setUp() public {
        vm.createSelectFork(vm.envString("BASE_MAINNET_RPC_URL"), BASE_BLOCK);
    }

    function test_pinnedBaseMainnet() public view {
        assertEq(block.chainid, 8453);
        assertEq(block.number, BASE_BLOCK);
        assertEq(block.timestamp, BASE_TIMESTAMP);
        assertEq(blockhash(BASE_BLOCK - 1), 0xac0ed6b214824779a5b8f953a450dba91bdbebc261b760ccb81784570646b6a4);
    }

    function test_nvdaIdentityAndDecimals() public view {
        // Native B20 marker: execution is provided by Base, not Solidity bytecode.
        assertEq(NVDAC.code, hex"ef");
        assertEq(IERC20Metadata(NVDAC).symbol(), "NVDAc");
        assertEq(IERC20Metadata(NVDAC).decimals(), 8);
    }

    function test_rawTransferExecutesNativeIssuerPolicy() public {
        IERC20Metadata token = IERC20Metadata(NVDAC);
        // Existing holder, discovered via Blockscout and verified at BASE_BLOCK.
        // Impersonation affects only this local fork; no key or funding is needed.
        address sender = 0xf8191D98ae98d2f7aBDFB63A9b0b812b93C873AA;
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
        assertEq(feed.decimals(), 8);
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
        assertFalse(paused);
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
