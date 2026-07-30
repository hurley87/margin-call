// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Vm} from "forge-std/Vm.sol";
import {Distributor} from "../../src/Distributor.sol";
import {GameToken} from "../../src/GameToken.sol";
import {MerkleTreeLib} from "./MerkleTreeLib.sol";

/// @notice GameToken + Distributor wired the way the deploy scripts wire them, plus Claim-Root helpers.
/// @dev Does not inherit `Test` so invariant suites can mix this with `StdInvariant`.
abstract contract DistributorFixture {
    Vm private constant _vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    uint256 internal constant WAD = 1e18;
    uint256 internal constant TOTAL_SUPPLY = 1_000_000_000e18;
    uint256 internal constant FUNDED = 300_000_000e18;

    GameToken internal token;
    Distributor internal distributor;

    // Deterministic labels matching forge-std `makeAddr`.
    address internal admin = address(uint160(uint256(keccak256(abi.encodePacked("admin")))));
    address internal treasury = address(uint160(uint256(keccak256(abi.encodePacked("treasury")))));
    address internal maker = address(uint160(uint256(keccak256(abi.encodePacked("maker")))));
    address internal maker2 = address(uint160(uint256(keccak256(abi.encodePacked("maker2")))));
    address internal taker = address(uint160(uint256(keccak256(abi.encodePacked("taker")))));
    address internal taker2 = address(uint160(uint256(keccak256(abi.encodePacked("taker2")))));
    address internal stranger = address(uint160(uint256(keccak256(abi.encodePacked("stranger")))));

    /// @dev One account's entitlement for one epoch, before it becomes a leaf.
    struct Entitlement {
        address account;
        uint256 makerAmount;
        uint256 takerAmount;
    }

    function setUp() public virtual {
        _vm.label(admin, "admin");
        _vm.label(treasury, "treasury");
        _vm.label(maker, "maker");
        _vm.label(maker2, "maker2");
        _vm.label(taker, "taker");
        _vm.label(taker2, "taker2");
        _vm.label(stranger, "stranger");

        token = new GameToken(admin, treasury, TOTAL_SUPPLY);
        distributor = new Distributor(admin, address(token));

        // Read the role before pranking: a getter call inside a pranked call consumes the prank.
        bytes32 distributorRole = token.DISTRIBUTOR_ROLE();
        _vm.prank(admin);
        token.grantRole(distributorRole, address(distributor));

        _fund(FUNDED);
    }

    /// @notice Move tokens from the treasury into the Distributor (the only funding path).
    function _fund(uint256 amount) internal {
        _vm.prank(treasury);
        token.transfer(address(distributor), amount);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Claim Root helpers
    //
    // `_leaves` / `_rootOf` / `_claimInput` hash through `distributor.leafOf`, so they issue view
    // calls. Build their results *before* `vm.prank` or `vm.expectRevert` — otherwise the getter
    // call, not the call under test, is the one the cheatcode applies to.
    // ─────────────────────────────────────────────────────────────────────────

    function _entitlements(Entitlement memory a) internal pure returns (Entitlement[] memory list) {
        list = new Entitlement[](1);
        list[0] = a;
    }

    function _entitlements(Entitlement memory a, Entitlement memory b)
        internal
        pure
        returns (Entitlement[] memory list)
    {
        list = new Entitlement[](2);
        list[0] = a;
        list[1] = b;
    }

    function _entitlements(Entitlement memory a, Entitlement memory b, Entitlement memory c)
        internal
        pure
        returns (Entitlement[] memory list)
    {
        list = new Entitlement[](3);
        list[0] = a;
        list[1] = b;
        list[2] = c;
    }

    /// @notice Canonical leaves for an epoch, hashed by the contract itself.
    function _leaves(uint256 epoch, Entitlement[] memory list) internal view returns (bytes32[] memory leaves) {
        leaves = new bytes32[](list.length);
        for (uint256 i; i < list.length; ++i) {
            leaves[i] = distributor.leafOf(epoch, list[i].account, list[i].makerAmount, list[i].takerAmount);
        }
    }

    function _rootOf(uint256 epoch, Entitlement[] memory list) internal view returns (bytes32) {
        return MerkleTreeLib.rootOf(_leaves(epoch, list));
    }

    function _totalOf(Entitlement[] memory list) internal pure returns (uint256 total) {
        for (uint256 i; i < list.length; ++i) {
            total += list[i].makerAmount + list[i].takerAmount;
        }
    }

    /// @notice Warp past `epoch`, then post its root with the exact declared total.
    function _postEpoch(uint256 epoch, Entitlement[] memory list) internal returns (bytes32 root, uint256 total) {
        root = _rootOf(epoch, list);
        total = _totalOf(list);
        _endEpoch(epoch);
        _vm.prank(admin);
        distributor.postClaimRoot(epoch, root, total);
    }

    /// @notice Build the claim call for `list[index]` under the epoch's tree.
    function _claimInput(uint256 epoch, Entitlement[] memory list, uint256 index)
        internal
        view
        returns (Distributor.ClaimInput memory input)
    {
        bytes32[] memory leaves = _leaves(epoch, list);
        input = Distributor.ClaimInput({
            epoch: epoch,
            makerAmount: list[index].makerAmount,
            takerAmount: list[index].takerAmount,
            proof: MerkleTreeLib.proofOf(leaves, leaves[index])
        });
    }

    /// @notice Ensure `epoch` is over so its root may be posted.
    function _endEpoch(uint256 epoch) internal {
        uint256 nextStart = distributor.epochStart(epoch + 1);
        if (block.timestamp < nextStart) {
            _vm.warp(nextStart);
        }
    }
}
