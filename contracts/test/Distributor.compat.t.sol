// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {Distributor} from "../src/Distributor.sol";
import {DistributorFixture} from "./helpers/DistributorFixture.sol";
import {MerkleTreeLib} from "./helpers/MerkleTreeLib.sol";

// Regenerate the pasted constants below with the openzeppelin/merkle-tree npm package (v1.0.8):
//
//   import {StandardMerkleTree} from "@openzeppelin/merkle-tree";
//   const values = [];
//   for (let i = 0; i < n; i++) {
//     const account = "0x" + (1000 + i).toString(16).padStart(40, "0");
//     values.push([7n, account, BigInt(i + 1) * 10n ** 18n, BigInt(i) * 5n * 10n ** 17n]);
//   }
//   const tree = StandardMerkleTree.of(values, ["uint256", "address", "uint256", "uint256"]);
//   console.log(tree.root, tree.getProof(2));

/// @notice Pins the Claim-Root format against OpenZeppelin's JavaScript StandardMerkleTree.
/// @dev `MerkleTreeLib` is our own re-implementation, so a test that checks it against itself
///      proves nothing about the integration the README promises. The roots and proof below came
///      out of the JavaScript library verbatim, so this suite fails the moment either side drifts.
contract DistributorMerkleCompatTest is Test, DistributorFixture {
    uint256 constant EPOCH = 7;

    /// @dev Accounts and amounts matching the snippet above.
    function _account(uint256 i) internal pure returns (address) {
        return address(uint160(1_000 + i));
    }

    function _makerAmount(uint256 i) internal pure returns (uint256) {
        return (i + 1) * 1e18;
    }

    function _takerAmount(uint256 i) internal pure returns (uint256) {
        return i * 5e17;
    }

    function _leaves(uint256 n) internal view returns (bytes32[] memory leaves) {
        leaves = new bytes32[](n);
        for (uint256 i; i < n; ++i) {
            leaves[i] = distributor.leafOf(EPOCH, _account(i), _makerAmount(i), _takerAmount(i));
        }
    }

    /// @notice Our tree layout reproduces the JavaScript library's root at every size.
    function test_rootsMatchStandardMerkleTree() public view {
        bytes32[6] memory expected = [
            bytes32(0x4aec46eb52785402fe766bb2d99435549560baf3c4a6321fe14416297b22a850),
            bytes32(0x3eace1abfa7c7b6826ef781e61a9fc118927decd9a017efe6c9b4feee5626b46),
            bytes32(0x1746ea26620e1c494feedd08355519393c6c140cf9beef7522eec4047ae49121),
            bytes32(0xfbdbbd31d18d4c09250c86db42734eb7902dcc39b087533eb6f14532b9cf6f41),
            bytes32(0x3caf853ffdfe9916072624ebd93d78716ae41821c18737af5dd14e5e9194c0c8),
            bytes32(0x77a18106bbc7de721feda8e131042fd594403790507003b5746b4f378faad1ea)
        ];

        for (uint256 n = 1; n <= 6; ++n) {
            assertEq(MerkleTreeLib.rootOf(_leaves(n)), expected[n - 1], "root diverged from StandardMerkleTree");
        }
    }

    /// @notice A root and proof produced entirely off-chain settle a real claim.
    /// @dev No Solidity tree building anywhere in this test — exactly the path the app will take.
    function test_claimSettlesAgainstAnOffChainRootAndProof() public {
        bytes32 root = 0xfbdbbd31d18d4c09250c86db42734eb7902dcc39b087533eb6f14532b9cf6f41;

        bytes32[] memory proof = new bytes32[](2);
        proof[0] = 0x6a635699b3bdeff234129b95c2d231de7ada06928803ea7d05edd57e6e25f007;
        proof[1] = 0x3eace1abfa7c7b6826ef781e61a9fc118927decd9a017efe6c9b4feee5626b46;

        _endEpoch(EPOCH);
        vm.prank(admin);
        distributor.postClaimRoot(EPOCH, root, 13e18);

        address account = _account(2);
        uint256 paid = distributor.claim(
            account, Distributor.ClaimInput({epoch: EPOCH, makerAmount: 3e18, takerAmount: 1e18, proof: proof})
        );

        assertEq(paid, 4e18);
        assertEq(token.balanceOf(account), 4e18);
        assertTrue(distributor.hasClaimed(EPOCH, account));
    }

    /// @notice The same off-chain proof is rejected for any other account or amount.
    function test_offChainProofIsBoundToItsLeaf() public {
        bytes32 root = 0xfbdbbd31d18d4c09250c86db42734eb7902dcc39b087533eb6f14532b9cf6f41;

        bytes32[] memory proof = new bytes32[](2);
        proof[0] = 0x6a635699b3bdeff234129b95c2d231de7ada06928803ea7d05edd57e6e25f007;
        proof[1] = 0x3eace1abfa7c7b6826ef781e61a9fc118927decd9a017efe6c9b4feee5626b46;

        _endEpoch(EPOCH);
        vm.prank(admin);
        distributor.postClaimRoot(EPOCH, root, 13e18);

        vm.expectRevert(abi.encodeWithSelector(Distributor.InvalidProof.selector, EPOCH, stranger));
        distributor.claim(
            stranger, Distributor.ClaimInput({epoch: EPOCH, makerAmount: 3e18, takerAmount: 1e18, proof: proof})
        );

        address account = _account(2);
        vm.expectRevert(abi.encodeWithSelector(Distributor.InvalidProof.selector, EPOCH, account));
        distributor.claim(
            account, Distributor.ClaimInput({epoch: EPOCH, makerAmount: 3e18, takerAmount: 2e18, proof: proof})
        );
    }
}
