// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {IERC1271} from "@openzeppelin/contracts/interfaces/IERC1271.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC721Receiver} from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import {TraderAccount} from "../src/TraderAccount.sol";
import {TraderIdentity} from "../src/TraderIdentity.sol";
import {IERC6551Account, IERC6551Executable} from "../src/interfaces/IERC6551.sol";
import {MockERC6551Registry} from "./mocks/MockERC6551Registry.sol";
import {MockERC20} from "./mocks/MockERC20.sol";

contract RevertingTarget {
    error Nope(uint256 code);

    function boom() external pure {
        revert Nope(42);
    }

    function boomString() external pure {
        revert("target failed");
    }
}

contract Counter {
    uint256 public value;

    function bump(uint256 by) external payable {
        value += by;
    }
}

contract TraderAccountTest is Test {
    MockERC6551Registry public registry;
    TraderAccount public implementation;
    TraderIdentity public identity;
    TraderAccount public account;

    uint256 public tokenId;

    address manager;
    uint256 managerKey;
    address buyer;
    uint256 buyerKey;
    address attacker = makeAddr("attacker");

    bytes32 constant SALT = bytes32(0);

    function setUp() public {
        (manager, managerKey) = makeAddrAndKey("manager");
        (buyer, buyerKey) = makeAddrAndKey("buyer");

        registry = new MockERC6551Registry();
        implementation = new TraderAccount();
        identity = new TraderIdentity("Margin Call Trader", "MCTRADER", "https://margincall.test/t/");

        vm.prank(manager);
        tokenId = identity.mint(manager);

        account = TraderAccount(payable(_createAccount(tokenId)));
    }

    function _createAccount(uint256 tokenId_) internal returns (address) {
        return registry.createAccount(address(implementation), SALT, block.chainid, address(identity), tokenId_);
    }

    function _transferTrader(address from, address to) internal {
        vm.prank(from);
        identity.transferFrom(from, to, tokenId);
    }

    // ========== Registry binding ==========

    function test_createAccount_isDeterministic() public view {
        address predicted = registry.account(address(implementation), SALT, block.chainid, address(identity), tokenId);
        assertEq(predicted, address(account));
    }

    function test_createAccount_isIdempotent() public {
        address again = _createAccount(tokenId);
        assertEq(again, address(account));
    }

    function test_token_decodesBoundIdentity() public view {
        (uint256 chainId, address tokenContract, uint256 boundTokenId) = account.token();
        assertEq(chainId, block.chainid);
        assertEq(tokenContract, address(identity));
        assertEq(boundTokenId, tokenId);
    }

    function test_accountsAreDistinctPerTrader() public {
        vm.prank(manager);
        uint256 second = identity.mint(manager);
        address secondAccount = _createAccount(second);

        assertTrue(secondAccount != address(account));
        (,, uint256 boundTokenId) = TraderAccount(payable(secondAccount)).token();
        assertEq(boundTokenId, second);
    }

    // ========== Ownership follows the NFT ==========

    function test_owner_isCurrentTokenOwner() public view {
        assertEq(account.owner(), manager);
    }

    function test_owner_followsTransferWithNoMigrationStep() public {
        _transferTrader(manager, buyer);
        assertEq(account.owner(), buyer);
    }

    function test_owner_isZeroWhenImplementationCalledDirectly() public view {
        // The bare implementation has no appended token data, so it must not
        // resolve an owner and must not be executable.
        assertEq(implementation.owner(), address(0));
    }

    // ========== Execute authorization ==========

    function test_execute_ownerCanCall() public {
        Counter counter = new Counter();

        vm.prank(manager);
        account.execute(address(counter), 0, abi.encodeCall(Counter.bump, (5)), 0);

        assertEq(counter.value(), 5);
    }

    function test_execute_incrementsState() public {
        Counter counter = new Counter();
        assertEq(account.state(), 0);

        vm.prank(manager);
        account.execute(address(counter), 0, abi.encodeCall(Counter.bump, (1)), 0);
        assertEq(account.state(), 1);

        vm.prank(manager);
        account.execute(address(counter), 0, abi.encodeCall(Counter.bump, (1)), 0);
        assertEq(account.state(), 2);
    }

    function test_execute_forwardsValue() public {
        Counter counter = new Counter();
        vm.deal(address(account), 1 ether);

        vm.prank(manager);
        account.execute(address(counter), 0.4 ether, abi.encodeCall(Counter.bump, (1)), 0);

        assertEq(address(counter).balance, 0.4 ether);
        assertEq(address(account).balance, 0.6 ether);
    }

    function test_execute_movesHeldTokens() public {
        MockERC20 usdg = new MockERC20("Margin Call Test USDG", "tUSDG", 6);
        usdg.mint(address(account), 1_000e6);

        vm.prank(manager);
        account.execute(address(usdg), 0, abi.encodeCall(IERC20.transfer, (buyer, 250e6)), 0);

        assertEq(usdg.balanceOf(buyer), 250e6);
        assertEq(usdg.balanceOf(address(account)), 750e6);
    }

    function test_execute_revertsForNonOwner() public {
        Counter counter = new Counter();

        vm.prank(attacker);
        vm.expectRevert("Not trader owner");
        account.execute(address(counter), 0, abi.encodeCall(Counter.bump, (1)), 0);
    }

    function test_execute_revertsForPreviousOwnerAfterTransfer() public {
        Counter counter = new Counter();
        _transferTrader(manager, buyer);

        vm.prank(manager);
        vm.expectRevert("Not trader owner");
        account.execute(address(counter), 0, abi.encodeCall(Counter.bump, (1)), 0);
    }

    function test_execute_newOwnerControlsAfterTransfer() public {
        Counter counter = new Counter();
        _transferTrader(manager, buyer);

        vm.prank(buyer);
        account.execute(address(counter), 0, abi.encodeCall(Counter.bump, (7)), 0);

        assertEq(counter.value(), 7);
    }

    function test_execute_revertsOnUnsupportedOperation() public {
        Counter counter = new Counter();

        vm.prank(manager);
        vm.expectRevert("Unsupported operation");
        account.execute(address(counter), 0, abi.encodeCall(Counter.bump, (1)), 1);
    }

    function test_execute_revertsOnBareImplementation() public {
        Counter counter = new Counter();

        vm.prank(manager);
        vm.expectRevert("Not trader owner");
        implementation.execute(address(counter), 0, abi.encodeCall(Counter.bump, (1)), 0);
    }

    function test_execute_bubblesCustomErrorFromTarget() public {
        RevertingTarget target = new RevertingTarget();

        vm.prank(manager);
        vm.expectRevert(abi.encodeWithSelector(RevertingTarget.Nope.selector, uint256(42)));
        account.execute(address(target), 0, abi.encodeCall(RevertingTarget.boom, ()), 0);
    }

    function test_execute_bubblesStringRevertFromTarget() public {
        RevertingTarget target = new RevertingTarget();

        vm.prank(manager);
        vm.expectRevert("target failed");
        account.execute(address(target), 0, abi.encodeCall(RevertingTarget.boomString, ()), 0);
    }

    // ========== Signer and signature validation ==========

    function test_isValidSigner_returnsMagicValueForOwner() public view {
        assertEq(account.isValidSigner(manager, ""), IERC6551Account.isValidSigner.selector);
    }

    function test_isValidSigner_rejectsStranger() public view {
        assertEq(account.isValidSigner(attacker, ""), bytes4(0));
    }

    function test_isValidSigner_rejectsZeroAddress() public view {
        assertEq(account.isValidSigner(address(0), ""), bytes4(0));
    }

    function test_isValidSigner_followsTransfer() public {
        _transferTrader(manager, buyer);

        assertEq(account.isValidSigner(buyer, ""), IERC6551Account.isValidSigner.selector);
        assertEq(account.isValidSigner(manager, ""), bytes4(0));
    }

    function test_isValidSignature_acceptsOwnerSignature() public view {
        bytes32 digest = keccak256("floor offer");
        bytes memory signature = _sign(managerKey, digest);

        assertEq(account.isValidSignature(digest, signature), IERC1271.isValidSignature.selector);
    }

    function test_isValidSignature_rejectsStrangerSignature() public view {
        bytes32 digest = keccak256("floor offer");
        bytes memory signature = _sign(buyerKey, digest);

        assertEq(account.isValidSignature(digest, signature), bytes4(0));
    }

    function test_isValidSignature_previousOwnerSignatureDiesOnTransfer() public {
        bytes32 digest = keccak256("floor offer");
        bytes memory signature = _sign(managerKey, digest);
        assertEq(account.isValidSignature(digest, signature), IERC1271.isValidSignature.selector);

        _transferTrader(manager, buyer);

        assertEq(account.isValidSignature(digest, signature), bytes4(0));
        assertEq(account.isValidSignature(digest, _sign(buyerKey, digest)), IERC1271.isValidSignature.selector);
    }

    function test_isValidSignature_rejectsWhenNoOwnerResolvable() public view {
        // Guards against ECDSA recovery of address(0) validating against an
        // ownerless account.
        bytes32 digest = keccak256("floor offer");
        assertEq(implementation.isValidSignature(digest, _sign(managerKey, digest)), bytes4(0));
        assertEq(implementation.isValidSignature(digest, hex""), bytes4(0));
    }

    function test_isValidSignature_rejectsMalformedSignature() public view {
        assertEq(account.isValidSignature(keccak256("x"), hex"1234"), bytes4(0));
    }

    // ========== Receiving assets ==========

    function test_receive_acceptsNativeValue() public {
        vm.deal(manager, 1 ether);
        vm.prank(manager);
        (bool ok,) = address(account).call{value: 1 ether}("");

        assertTrue(ok);
        assertEq(address(account).balance, 1 ether);
    }

    function test_onERC721Received_acceptsForeignCollection() public {
        TraderIdentity lots = new TraderIdentity("Lot", "LOT", "https://margincall.test/lot/");
        vm.prank(manager);
        uint256 lotId = lots.mint(manager);

        vm.prank(manager);
        lots.safeTransferFrom(manager, address(account), lotId);

        assertEq(lots.ownerOf(lotId), address(account));
    }

    function test_onERC721Received_rejectsOwnControllingToken() public {
        vm.prank(manager);
        vm.expectRevert("Ownership cycle");
        identity.safeTransferFrom(manager, address(account), tokenId);
    }

    function test_onERC721Received_acceptsAnotherTraderToken() public {
        vm.prank(manager);
        uint256 other = identity.mint(manager);

        vm.prank(manager);
        identity.safeTransferFrom(manager, address(account), other);

        assertEq(identity.ownerOf(other), address(account));
    }

    // ========== Introspection ==========

    function test_supportsInterface_advertisesAccountInterfaces() public view {
        assertTrue(account.supportsInterface(type(IERC6551Account).interfaceId));
        assertTrue(account.supportsInterface(type(IERC6551Executable).interfaceId));
        assertTrue(account.supportsInterface(type(IERC1271).interfaceId));
        assertTrue(account.supportsInterface(type(IERC721Receiver).interfaceId));
        assertFalse(account.supportsInterface(bytes4(0xdeadbeef)));
    }

    // ========== Fuzz ==========

    function testFuzz_onlyCurrentOwnerCanExecute(address caller) public {
        vm.assume(caller != manager);
        Counter counter = new Counter();

        vm.prank(caller);
        vm.expectRevert("Not trader owner");
        account.execute(address(counter), 0, abi.encodeCall(Counter.bump, (1)), 0);
    }

    function testFuzz_controlTracksOwnerAcrossTransfers(uint8 hops) public {
        hops = uint8(bound(hops, 1, 16));
        Counter counter = new Counter();

        address current = manager;
        for (uint256 i = 0; i < hops; i++) {
            address next = address(uint160(uint256(keccak256(abi.encode("hop", i)))));
            vm.assume(next != address(0) && next != current);

            vm.prank(current);
            identity.transferFrom(current, next, tokenId);

            // The account it just left must be inert for the previous owner.
            vm.prank(current);
            vm.expectRevert("Not trader owner");
            account.execute(address(counter), 0, abi.encodeCall(Counter.bump, (1)), 0);

            vm.prank(next);
            account.execute(address(counter), 0, abi.encodeCall(Counter.bump, (1)), 0);

            current = next;
        }

        assertEq(account.owner(), current);
        assertEq(counter.value(), hops);
    }

    function _sign(uint256 key, bytes32 digest) internal pure returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, digest);
        return abi.encodePacked(r, s, v);
    }
}
