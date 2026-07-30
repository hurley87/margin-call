// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Hashes} from "@openzeppelin/contracts/utils/cryptography/Hashes.sol";

/// @notice Builds Claim-Root merkle trees and inclusion proofs inside tests.
/// @dev Mirrors OpenZeppelin's JavaScript `StandardMerkleTree` so a root computed here equals the
///      root an off-chain builder produces from the same leaves: leaves sorted ascending, laid into
///      a `2n − 1` node array back-to-front, parents hashed with commutative sorted-pair keccak256.
///      Nothing in `Distributor` depends on this layout — only on the leaf encoding — but keeping
///      the two in step is what lets a test recompute a root the way anyone else would.
library MerkleTreeLib {
    error EmptyLeafSet();
    error LeafNotInTree(bytes32 leaf);

    /// @notice Merkle root over `leaves`.
    function rootOf(bytes32[] memory leaves) internal pure returns (bytes32) {
        return _build(_sorted(leaves))[0];
    }

    /// @notice Inclusion proof for `leaf` under `rootOf(leaves)`.
    function proofOf(bytes32[] memory leaves, bytes32 leaf) internal pure returns (bytes32[] memory proof) {
        bytes32[] memory sorted = _sorted(leaves);
        bytes32[] memory tree = _build(sorted);

        uint256 node = tree.length - 1 - _indexOf(sorted, leaf);
        proof = new bytes32[](_depthOf(node));

        for (uint256 i; node > 0; ++i) {
            proof[i] = tree[node % 2 == 1 ? node + 1 : node - 1];
            node = (node - 1) / 2;
        }
    }

    function _build(bytes32[] memory sorted) private pure returns (bytes32[] memory tree) {
        uint256 n = sorted.length;
        if (n == 0) revert EmptyLeafSet();

        tree = new bytes32[](2 * n - 1);
        for (uint256 i; i < n; ++i) {
            tree[tree.length - 1 - i] = sorted[i];
        }
        for (uint256 i = n - 1; i > 0;) {
            --i;
            tree[i] = Hashes.commutativeKeccak256(tree[2 * i + 1], tree[2 * i + 2]);
        }
    }

    /// @dev Insertion sort ascending. Test-only input sizes, so simplicity beats asymptotics.
    function _sorted(bytes32[] memory leaves) private pure returns (bytes32[] memory sorted) {
        uint256 n = leaves.length;
        sorted = new bytes32[](n);
        for (uint256 i; i < n; ++i) {
            bytes32 value = leaves[i];
            uint256 j = i;
            while (j > 0 && sorted[j - 1] > value) {
                sorted[j] = sorted[j - 1];
                --j;
            }
            sorted[j] = value;
        }
    }

    function _indexOf(bytes32[] memory sorted, bytes32 leaf) private pure returns (uint256) {
        for (uint256 i; i < sorted.length; ++i) {
            if (sorted[i] == leaf) return i;
        }
        revert LeafNotInTree(leaf);
    }

    function _depthOf(uint256 node) private pure returns (uint256 depth) {
        while (node > 0) {
            node = (node - 1) / 2;
            ++depth;
        }
    }
}
