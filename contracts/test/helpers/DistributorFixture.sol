// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Vm} from "forge-std/Vm.sol";
import {Distributor} from "../../src/Distributor.sol";
import {GameToken} from "../../src/GameToken.sol";

/// @notice GameToken + Distributor wired the way the deploy scripts wire them.
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
    address internal ripEngine = address(uint160(uint256(keccak256(abi.encodePacked("ripEngine")))));
    address internal maker = address(uint160(uint256(keccak256(abi.encodePacked("maker")))));
    address internal maker2 = address(uint160(uint256(keccak256(abi.encodePacked("maker2")))));
    address internal taker = address(uint160(uint256(keccak256(abi.encodePacked("taker")))));
    address internal taker2 = address(uint160(uint256(keccak256(abi.encodePacked("taker2")))));
    address internal stranger = address(uint160(uint256(keccak256(abi.encodePacked("stranger")))));

    function setUp() public virtual {
        _vm.label(admin, "admin");
        _vm.label(treasury, "treasury");
        _vm.label(ripEngine, "ripEngine");
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

        _vm.prank(admin);
        distributor.setRipEngine(ripEngine);

        _fund(FUNDED);
    }

    /// @notice Move tokens from the treasury into the Distributor (the only funding path).
    function _fund(uint256 amount) internal {
        _vm.prank(treasury);
        token.transfer(address(distributor), amount);
    }

    /// @notice Ensure `epoch` is over so its Taker rewards may be claimed.
    function _endEpoch(uint256 epoch) internal {
        uint256 nextStart = distributor.epochStart(epoch + 1);
        if (block.timestamp < nextStart) {
            _vm.warp(nextStart);
        }
    }

    function _enterPack(uint256 tokenId, address who) internal {
        _vm.prank(ripEngine);
        distributor.onPackEntered(tokenId, who);
    }

    function _exitPack(uint256 tokenId) internal {
        _vm.prank(ripEngine);
        distributor.onPackExited(tokenId);
    }

    function _recordRip(address who, uint256 count) internal {
        _vm.prank(ripEngine);
        distributor.onRip(who, count);
    }
}
