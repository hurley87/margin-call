// SPDX-License-Identifier: MIT
pragma solidity 0.8.29;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {Base64} from "@openzeppelin/contracts/utils/Base64.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";

/// @title MarginCall
/// @notice Spot-only Position NFT: custody NVDAc, record an isolated position, and mint ERC-721 ownership on this contract.
/// @dev `MarginCall` is the ERC-721. Token existence is the active-position status. Financed opening, oracle, credit, and
///      execution are out of this slice. Production NVDAc on Base is `0xb20000000000000000000078ee7ce2fE4908108C`.
contract MarginCall is ERC721 {
    using SafeERC20 for IERC20;

    struct Position {
        uint256 stockAmount;
        uint256 principal;
        uint256 accruedInterest;
        uint256 lastAccruedAt;
        address executor;
    }

    error ZeroAddress();
    error ZeroStockAmount();
    error UnsupportedLeverage(uint256 targetLeverage);
    error InvalidMinNvdaOut(uint256 minNvdaOut);
    error NotPositionOwner(address caller, address owner);
    error DebtOutstanding(uint256 tokenId);

    event PositionOpened(uint256 indexed tokenId, address indexed owner, uint256 stockAmount);
    event PositionClosed(uint256 indexed tokenId, address indexed owner, uint256 stockAmount);

    /// @notice 1.0x opening leverage in basis points (`10_000` = 1x), matching V1 `BPS_DENOMINATOR` scaling.
    uint256 public constant SPOT_LEVERAGE = 10_000;

    IERC20 public immutable NVDAC;

    mapping(uint256 tokenId => Position) public positions;

    uint256 private _nextTokenId;

    constructor(address nvdac_) ERC721("Margin Call Position", "MCP") {
        if (nvdac_ == address(0)) {
            revert ZeroAddress();
        }
        NVDAC = IERC20(nvdac_);
    }

    /// @notice Deposit `stockAmount` raw NVDAc at a V1 opening preset and mint a Position NFT to the caller.
    /// @dev This slice accepts only `SPOT_LEVERAGE` (`1.0x`) and `minNvdaOut == 0` because no swap occurs. Financed
    ///      presets reuse this ABI. Position state and `PositionOpened` are committed before `_safeMint` so a receiver
    ///      callback cannot observe an uninitialized token or reorder the open event after close/transfer.
    function openPosition(uint256 stockAmount, uint256 targetLeverage, uint256 minNvdaOut)
        external
        returns (uint256 tokenId)
    {
        if (stockAmount == 0) {
            revert ZeroStockAmount();
        }
        if (targetLeverage != SPOT_LEVERAGE) {
            revert UnsupportedLeverage(targetLeverage);
        }
        if (minNvdaOut != 0) {
            revert InvalidMinNvdaOut(minNvdaOut);
        }

        NVDAC.safeTransferFrom(msg.sender, address(this), stockAmount);

        tokenId = ++_nextTokenId;
        // `_nextTokenId` only ever increments and `closePosition` deletes the slot it burns, so `tokenId` is
        // always fresh and `principal`, `accruedInterest`, and `executor` are already zero. Write only the two
        // fields this slice owns; the financed slice adds its writes here.
        Position storage position = positions[tokenId];
        position.stockAmount = stockAmount;
        position.lastAccruedAt = block.timestamp;
        emit PositionOpened(tokenId, msg.sender, stockAmount);
        _safeMint(msg.sender, tokenId);
    }

    /// @notice Owner-only close of a debt-free position. Returns this token's recorded NVDAc and burns the NFT.
    function closePosition(uint256 tokenId) external {
        address owner = _requireOwned(tokenId);
        if (msg.sender != owner) {
            revert NotPositionOwner(msg.sender, owner);
        }
        if (currentDebt(tokenId) != 0) {
            revert DebtOutstanding(tokenId);
        }

        uint256 stockAmount = positions[tokenId].stockAmount;
        delete positions[tokenId];
        _burn(tokenId);

        NVDAC.safeTransfer(owner, stockAmount);

        emit PositionClosed(tokenId, owner, stockAmount);
    }

    /// @notice Stored principal plus accrued interest. Spot-only positions are opened at zero debt.
    /// @dev Inert in this slice: nothing writes `principal` or `accruedInterest`, so this returns `0` for every
    ///      live token and the `DebtOutstanding` guard in `closePosition` is unreachable. The financed-opening
    ///      slice is the first to make both meaningful.
    function currentDebt(uint256 tokenId) public view returns (uint256) {
        Position storage position = positions[tokenId];
        return position.principal + position.accruedInterest;
    }

    /// @notice Minimal identity metadata for a live Position NFT. Full living presentation is owned by a later slice.
    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        string memory json = string.concat(
            '{"name":"Margin Call Position ',
            Strings.toString(tokenId),
            '","description":"Spot-only NVDAc Position NFT"}'
        );
        return string.concat("data:application/json;base64,", Base64.encode(bytes(json)));
    }

    /// @dev Clear the executor on a real ownership transfer before any `safeTransferFrom` receiver callback.
    ///      Inert in this slice: nothing assigns `executor`, so this write is always zero-to-zero. It is kept so
    ///      the ordering guarantee ships with the field rather than trailing it.
    function _update(address to, uint256 tokenId, address auth) internal override returns (address from) {
        from = super._update(to, tokenId, auth);
        if (from != address(0) && to != address(0) && from != to) {
            positions[tokenId].executor = address(0);
        }
    }
}
