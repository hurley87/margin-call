// SPDX-License-Identifier: MIT
pragma solidity 0.8.29;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {CreditPool} from "../src/CreditPool.sol";
import {ExecutionAdapter} from "../src/ExecutionAdapter.sol";
import {MarginCall} from "../src/MarginCall.sol";
import {OracleAdapter} from "../src/OracleAdapter.sol";
import {V1Config} from "../src/V1Config.sol";
import {BaseV1Constants} from "../test/fixtures/BaseV1Constants.sol";

/// @dev Shared pinned-fork fixture for the RPC-dependent `MarginCall` suites: selects the pinned Base block,
///      deploys the production adapter stack against the real token and feed addresses, registers NVDAc as
///      asset id 1, wires and seeds `CreditPool`, and funds one actor with NVDAc. Mirrors the role
///      `MarginCallTestBase` plays for the RPC-free suites so a constructor change to any of the four
///      contracts is a single edit here. Subclasses supply their own actor label via `_forkActorLabel()`
///      and add only their assertions.
abstract contract MarginCallForkBase is Test {
    uint256 internal constant BASE_BLOCK = BaseV1Constants.PINNED_BLOCK;
    uint256 internal constant ONE_NVDAC = 10 ** uint256(BaseV1Constants.NVDAC_DECIMALS);
    uint256 internal constant CREDIT_SEED = 500_000e6;

    IERC20 internal nvdac = IERC20(BaseV1Constants.NVDAC);
    IERC20 internal usdc = IERC20(BaseV1Constants.USDC);

    OracleAdapter internal oracle;
    ExecutionAdapter internal execution;
    MarginCall internal marginCall;
    CreditPool internal pool;

    /// @dev 1-indexed id returned by `addAsset` for the NVDAc registration in `setUp`.
    uint256 internal nvdaAssetId;

    address internal alice;
    address internal treasury;
    address internal assetAdmin;

    /// @dev Distinct per suite so funded balances never collide across fork tests.
    function _forkActorLabel() internal pure virtual returns (string memory);

    function setUp() public virtual {
        vm.createSelectFork(vm.envString("BASE_MAINNET_RPC_URL"), BASE_BLOCK);
        alice = makeAddr(_forkActorLabel());
        treasury = makeAddr("treasury");
        assetAdmin = makeAddr("assetAdmin");
        // Ensure the opener is a pure EOA on the forked chain (safeMint rejects contract recipients
        // that lack IERC721Receiver).
        vm.etch(alice, "");

        oracle = new OracleAdapter(
            BaseV1Constants.NVDAC,
            BaseV1Constants.NVDA_FEED,
            BaseV1Constants.COINBASE_ORACLE_REGISTRY,
            BaseV1Constants.BASE_SEQUENCER_UPTIME_FEED
        );
        execution = new ExecutionAdapter(
            BaseV1Constants.USDC,
            BaseV1Constants.NVDAC,
            BaseV1Constants.UNISWAP_SWAP_ROUTER_02,
            BaseV1Constants.UNISWAP_FEE
        );
        marginCall = new MarginCall(BaseV1Constants.USDC, assetAdmin);
        pool = new CreditPool(BaseV1Constants.USDC, address(marginCall), treasury);
        marginCall.setCreditPool(address(pool));

        vm.prank(assetAdmin);
        nvdaAssetId = marginCall.addAsset(BaseV1Constants.NVDAC, address(oracle), address(execution));

        deal(BaseV1Constants.USDC, address(pool), CREDIT_SEED);
        _fundNvda(alice, 10 * ONE_NVDAC);
        vm.prank(alice);
        nvdac.approve(address(marginCall), type(uint256).max);
    }

    function _fundNvda(address to, uint256 amount) internal {
        vm.prank(BaseV1Constants.PINNED_NVDAC_HOLDER);
        assertTrue(nvdac.transfer(to, amount));
    }

    function _open(address user, uint256 amount) internal returns (uint256 tokenId) {
        vm.prank(user);
        tokenId = marginCall.openPosition(nvdaAssetId, amount, V1Config.SPOT_LEVERAGE, 0);
    }

    function _openFinanced(address user, uint256 amount, uint256 leverage, uint256 minOut)
        internal
        returns (uint256 tokenId)
    {
        vm.prank(user);
        tokenId = marginCall.openPosition(nvdaAssetId, amount, leverage, minOut);
    }
}
