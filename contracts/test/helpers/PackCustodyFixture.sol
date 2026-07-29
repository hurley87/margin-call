// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {PackCustody} from "../../src/PackCustody.sol";
import {MockStockToken} from "../mocks/MockStockToken.sol";

/// @notice Shared deployment for PackCustody suites: five whitelisted Stock Token doubles
///         with mixed decimals, one off-list token, and funded actors.
abstract contract PackCustodyFixture is Test {
    PackCustody internal packs;

    MockStockToken internal amzn;
    MockStockToken internal amd;
    MockStockToken internal nflx;
    MockStockToken internal pltr;
    MockStockToken internal tsla;

    /// @notice Deliberately not whitelisted.
    MockStockToken internal offList;

    address[] internal whitelist;

    address internal admin = makeAddr("admin");
    address internal creator = makeAddr("creator");
    address internal otherCreator = makeAddr("otherCreator");
    address internal buyer = makeAddr("buyer");
    address internal stranger = makeAddr("stranger");
    address internal ripEngine = makeAddr("ripEngine");

    function setUp() public virtual {
        // Mixed decimals mirror the real Stock Token spread rather than assuming 18 everywhere.
        amzn = new MockStockToken("Amazon Test Stock", "tAMZN", 18);
        amd = new MockStockToken("AMD Test Stock", "tAMD", 18);
        nflx = new MockStockToken("Netflix Test Stock", "tNFLX", 8);
        pltr = new MockStockToken("Palantir Test Stock", "tPLTR", 6);
        tsla = new MockStockToken("Tesla Test Stock", "tTSLA", 18);
        offList = new MockStockToken("Off List Token", "tOFF", 18);

        whitelist.push(address(amzn));
        whitelist.push(address(amd));
        whitelist.push(address(nflx));
        whitelist.push(address(pltr));
        whitelist.push(address(tsla));

        packs = new PackCustody(admin, whitelist);

        _fundActor(creator);
        _fundActor(otherCreator);
        _fundActor(buyer);
        _fundActor(stranger);
    }

    /// @dev Grants `RIP_ENGINE_ROLE` to `ripEngine`. Role is not granted at construction.
    function _grantRipEngine() internal {
        bytes32 role = packs.RIP_ENGINE_ROLE();
        vm.prank(admin);
        packs.grantRole(role, ripEngine);
    }

    /// @dev Mints a generous balance of every token to `who` and approves custody for all of them.
    function _fundActor(address who) internal {
        MockStockToken[6] memory tokens = [amzn, amd, nflx, pltr, tsla, offList];

        for (uint256 i; i < tokens.length; ++i) {
            uint256 amount = 1_000_000 * (10 ** tokens[i].decimals());
            tokens[i].mint(who, amount);

            vm.prank(who);
            tokens[i].approve(address(packs), type(uint256).max);
        }
    }

    function _single(address asset, uint256 amount)
        internal
        pure
        returns (address[] memory assets, uint256[] memory amounts)
    {
        assets = new address[](1);
        amounts = new uint256[](1);
        assets[0] = asset;
        amounts[0] = amount;
    }

    function _pair(address assetA, uint256 amountA, address assetB, uint256 amountB)
        internal
        pure
        returns (address[] memory assets, uint256[] memory amounts)
    {
        assets = new address[](2);
        amounts = new uint256[](2);
        assets[0] = assetA;
        amounts[0] = amountA;
        assets[1] = assetB;
        amounts[1] = amountB;
    }

    /// @dev A representative three-asset basket across three decimal shapes.
    function _defaultBasket() internal view returns (address[] memory assets, uint256[] memory amounts) {
        assets = new address[](3);
        amounts = new uint256[](3);
        assets[0] = address(amzn);
        amounts[0] = 2e18;
        assets[1] = address(nflx);
        amounts[1] = 5e8;
        assets[2] = address(pltr);
        amounts[2] = 7e6;
    }

    /// @dev Mints a Pack held by `who` containing the default basket.
    function _mintDefaultPack(address who) internal returns (uint256 tokenId) {
        (address[] memory assets, uint256[] memory amounts) = _defaultBasket();
        vm.prank(who);
        tokenId = packs.mint(assets, amounts);
    }
}
