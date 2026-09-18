// SPDX-License-Identifier: MIT
pragma solidity 0.8.29;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {Base64} from "@openzeppelin/contracts/utils/Base64.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";

import {ICreditPool} from "./interfaces/ICreditPool.sol";
import {IExecutionAdapter} from "./interfaces/IExecutionAdapter.sol";
import {IOracleAdapter} from "./interfaces/IOracleAdapter.sol";
import {V1Config} from "./V1Config.sol";

/// @title MarginCall
/// @notice Position NFT coordinator: curated multi-stock custody, spot or financed opens, and ERC-721 ownership.
/// @dev `MarginCall` is the ERC-721. Each Position records one supported `assetId` forever and holds that stock
///      plus its debt. An immutable `ASSET_ADMIN` may append new assets and toggle opening; core token/oracle/
///      execution config is immutable after registration. `setExecutor` appoints one optional executor.
///      `reduceExposure` sells exact recorded stock to repay debt; `liquidate` permissionlessly unwinds unhealthy
///      financed positions under LIVE pricing. `riskSnapshot` is the LIVE-only risk view. Borrowed USDC buys more
///      of the same stock through that asset's fixed Uniswap execution path. Debt accrues lazily at the immutable
///      V1 10% APR; `repay` restores USDC to the shared pool. Real ownership transfers clear the stored executor.
///      The living NFT presentation (`tokenURI`) remains a later slice.
contract MarginCall is ERC721 {
    using SafeERC20 for IERC20;

    struct AssetConfig {
        address stock;
        IOracleAdapter oracle;
        IExecutionAdapter execution;
        bool openingEnabled;
    }

    struct Position {
        uint256 assetId;
        uint256 stockAmount;
        uint256 principal;
        uint256 accruedInterest;
        uint256 lastAccruedAt;
        address executor;
    }

    /// @notice LIVE-only solvency read for one position. Unavailable when pricing is `HELD` or `INVALID`.
    struct RiskSnapshot {
        uint256 nav;
        uint256 currentDebt;
        bool liquidatable;
    }

    error ZeroAddress();
    error ZeroStockAmount();
    error ExcessStockAmount(uint256 requested, uint256 available);
    error UnsupportedLeverage(uint256 targetLeverage);
    error InvalidMinStockOut(uint256 minStockOut);
    error NotPositionOwner(address caller, address owner);
    error NotPositionManager(address caller, address owner, address executor);
    error DebtOutstanding(uint256 tokenId);
    error ZeroRepayment();
    error CreditPoolAlreadySet();
    error NotInitializer(address caller);
    error NotAssetAdmin(address caller);
    error InvalidCreditPool();
    error OracleNotLive(IOracleAdapter.State state);
    error ContributionTooSmall(uint256 contributionValue);
    error LeverageExceeded(uint256 targetLeverage, uint256 nav, uint256 debt);
    error NotLiquidatable(uint256 tokenId);
    error UnknownAsset(uint256 assetId);
    error AssetOpeningDisabled(uint256 assetId);
    error AssetAlreadyRegistered(address stock);
    error AdapterAlreadyRegistered(address adapter);
    error InvalidAssetConfig();
    error IndexOutOfBounds(uint256 index, uint256 length);

    event PositionOpened(uint256 indexed tokenId, address indexed owner, uint256 indexed assetId, uint256 stockAmount);
    event CreditDrawn(uint256 indexed tokenId, uint256 usdcAmount);
    event DebtRepaid(uint256 indexed tokenId, uint256 usdcAmount);
    event ExposureReduced(uint256 indexed tokenId, uint256 stockAmount, uint256 usdcOut);
    event ExecutorUpdated(uint256 indexed tokenId, address indexed previousExecutor, address indexed newExecutor);
    event PositionClosed(uint256 indexed tokenId, address indexed owner, uint256 stockAmount);
    event PositionLiquidated(uint256 indexed tokenId, address indexed owner, uint256 stockAmount, uint256 usdcOut);
    event BadDebtRealized(uint256 indexed tokenId, uint256 shortfall);
    event CreditPoolSet(address indexed creditPool);
    event AssetAdded(
        uint256 indexed assetId, address indexed stock, address oracle, address execution, bool openingEnabled
    );
    event AssetOpeningEnabled(uint256 indexed assetId, bool enabled);

    /// @notice 1.0x opening leverage in basis points (`10_000` = 1x).
    uint256 public constant SPOT_LEVERAGE = V1Config.SPOT_LEVERAGE;
    uint256 public constant BPS_DENOMINATOR = V1Config.BPS_DENOMINATOR;
    uint256 public constant MAX_OPENING_LEVERAGE = V1Config.LEVERAGE_1_5X;

    IERC20 public immutable USDC;

    /// @notice The deployer, and the only address permitted to wire the credit pool. Holds no other authority:
    ///         it cannot rewire the pool afterwards, move custody, or touch a position.
    address public immutable INITIALIZER;

    /// @notice Narrowly scoped immutable admin that may append assets and toggle opening. Cannot move custody,
    ///         alter debt, transfer NFTs, withdraw stock, or change the CreditPool borrower.
    address public immutable ASSET_ADMIN;

    ICreditPool public creditPool;

    mapping(uint256 tokenId => Position) private _positions;
    mapping(uint256 assetId => AssetConfig) private _assets;
    mapping(address stock => uint256 assetId) public assetIdOf;
    mapping(address adapter => bool) private _registeredAdapters;

    uint256[] private _assetIds;
    uint256 private _nextTokenId;
    uint256 private _nextAssetId;

    constructor(address usdc_, address assetAdmin_) ERC721("Margin Call Position", "MCP") {
        if (usdc_ == address(0) || assetAdmin_ == address(0)) {
            revert ZeroAddress();
        }
        USDC = IERC20(usdc_);
        INITIALIZER = msg.sender;
        ASSET_ADMIN = assetAdmin_;
    }

    /// @notice One-time wire of the protocol USDC pool. Validates immutable borrower and USDC match.
    /// @dev Restricted to `INITIALIZER`. The value checks below are on caller-supplied view functions, so without
    ///      this guard any address could front-run deployment with a conforming contract and, because
    ///      `CreditPoolAlreadySet` makes the pointer permanent, brick financed opening until redeploy.
    function setCreditPool(address creditPool_) external {
        if (msg.sender != INITIALIZER) {
            revert NotInitializer(msg.sender);
        }
        if (address(creditPool) != address(0)) {
            revert CreditPoolAlreadySet();
        }
        if (creditPool_ == address(0)) {
            revert ZeroAddress();
        }
        ICreditPool pool = ICreditPool(creditPool_);
        if (address(pool.USDC()) != address(USDC) || pool.borrower() != address(this)) {
            revert InvalidCreditPool();
        }
        creditPool = pool;
        emit CreditPoolSet(creditPool_);
    }

    /// @notice Register a new supported stock with fixed oracle and execution adapters. Opening starts enabled.
    /// @dev Core token/oracle/execution config is immutable after this call. Duplicate stock or reused adapters
    ///      revert. Fail-closes unless both adapters report the same stock and the execution adapter's USDC matches.
    function addAsset(address stock, address oracle, address execution) external returns (uint256 assetId) {
        if (msg.sender != ASSET_ADMIN) {
            revert NotAssetAdmin(msg.sender);
        }
        if (stock == address(0) || oracle == address(0) || execution == address(0)) {
            revert ZeroAddress();
        }
        if (assetIdOf[stock] != 0) {
            revert AssetAlreadyRegistered(stock);
        }
        if (_registeredAdapters[oracle]) {
            revert AdapterAlreadyRegistered(oracle);
        }
        if (_registeredAdapters[execution]) {
            revert AdapterAlreadyRegistered(execution);
        }
        if (oracle == execution) {
            revert InvalidAssetConfig();
        }

        IOracleAdapter oracleAdapter = IOracleAdapter(oracle);
        IExecutionAdapter executionAdapter = IExecutionAdapter(execution);
        if (
            oracleAdapter.STOCK() != stock || address(executionAdapter.STOCK()) != stock
                || address(executionAdapter.USDC()) != address(USDC)
        ) {
            revert InvalidAssetConfig();
        }

        assetId = ++_nextAssetId;
        _assets[assetId] =
            AssetConfig({stock: stock, oracle: oracleAdapter, execution: executionAdapter, openingEnabled: true});
        assetIdOf[stock] = assetId;
        _registeredAdapters[oracle] = true;
        _registeredAdapters[execution] = true;
        _assetIds.push(assetId);

        emit AssetAdded(assetId, stock, oracle, execution, true);
    }

    /// @notice Enable or disable new opens for an existing asset. Existing positions remain fully manageable.
    function setAssetOpeningEnabled(uint256 assetId, bool enabled) external {
        if (msg.sender != ASSET_ADMIN) {
            revert NotAssetAdmin(msg.sender);
        }
        AssetConfig storage asset = _requireAsset(assetId);
        asset.openingEnabled = enabled;
        emit AssetOpeningEnabled(assetId, enabled);
    }

    /// @notice Number of registered assets.
    function assetCount() external view returns (uint256) {
        return _assetIds.length;
    }

    /// @notice The `assetId` at enumeration index `index` (0-based over registration order).
    function assetAt(uint256 index) external view returns (uint256 assetId) {
        if (index >= _assetIds.length) {
            revert IndexOutOfBounds(index, _assetIds.length);
        }
        return _assetIds[index];
    }

    /// @notice Full config for a registered asset. Reverts for unknown ids.
    function assetConfig(uint256 assetId) external view returns (AssetConfig memory) {
        return _requireAsset(assetId);
    }

    /// @notice Deposit `stockAmount` of a supported asset at a V1 opening preset and mint a Position NFT.
    /// @dev Spot (`1.0x`) is oracle-free and requires `minStockOut == 0`. Financed presets require `LIVE` pricing,
    ///      draw USDC from `CreditPool`, buy more of the same stock through that asset's execution adapter, and
    ///      mint only after post-execution leverage checks. Position state and events commit before `_safeMint`.
    function openPosition(uint256 assetId, uint256 stockAmount, uint256 targetLeverage, uint256 minStockOut)
        external
        returns (uint256 tokenId)
    {
        if (stockAmount == 0) {
            revert ZeroStockAmount();
        }
        if (!V1Config.isSupportedOpeningLeverage(targetLeverage)) {
            revert UnsupportedLeverage(targetLeverage);
        }

        AssetConfig storage asset = _requireAsset(assetId);
        if (!asset.openingEnabled) {
            revert AssetOpeningDisabled(assetId);
        }

        IERC20 stock = IERC20(asset.stock);
        stock.safeTransferFrom(msg.sender, address(this), stockAmount);

        uint256 finalStock = stockAmount;
        uint256 principal;

        if (targetLeverage == SPOT_LEVERAGE) {
            if (minStockOut != 0) {
                revert InvalidMinStockOut(minStockOut);
            }
        } else {
            (finalStock, principal) = _openFinanced(asset, stockAmount, targetLeverage, minStockOut);
        }

        tokenId = ++_nextTokenId;
        Position storage position = _positions[tokenId];
        position.assetId = assetId;
        position.stockAmount = finalStock;
        position.lastAccruedAt = block.timestamp;

        emit PositionOpened(tokenId, msg.sender, assetId, finalStock);
        if (principal != 0) {
            position.principal = principal;
            emit CreditDrawn(tokenId, principal);
        }
        _safeMint(msg.sender, tokenId);
    }

    /// @notice Owner-only close of a debt-free position. Returns this token's recorded stock and burns the NFT.
    /// @dev Oracle-free. Financed positions must reach zero debt via `repay` or `reduceExposure` first.
    function closePosition(uint256 tokenId) external {
        address owner = _requirePositionOwner(tokenId);
        if (currentDebt(tokenId) != 0) {
            revert DebtOutstanding(tokenId);
        }

        Position storage position = _positions[tokenId];
        uint256 stockAmount = position.stockAmount;
        IERC20 stock = IERC20(_requireAsset(position.assetId).stock);
        delete _positions[tokenId];
        _burn(tokenId);

        stock.safeTransfer(owner, stockAmount);

        emit PositionClosed(tokenId, owner, stockAmount);
    }

    /// @notice Owner-only appointment of the single optional executor for `tokenId`.
    /// @dev Supports setting, replacing, and clearing (`address(0)`). Oracle-free. ERC-721 approvals and the
    ///      current executor cannot call this. Transfer clears the stored executor via `_update`.
    function setExecutor(uint256 tokenId, address executor) external {
        _requirePositionOwner(tokenId);
        Position storage position = _positions[tokenId];
        address previous = position.executor;
        position.executor = executor;
        emit ExecutorUpdated(tokenId, previous, executor);
    }

    /// @notice Accrue interest, then repay up to `amount` of current debt with external USDC.
    /// @dev Oracle-free. Transfers only `min(amount, currentDebt)` from the caller; excess never leaves the wallet.
    ///      Applies payment interest-first, then principal, and restores the paid USDC to `CreditPool`.
    ///      Owner or executor may call; ERC-721 approval does not grant repay authority.
    function repay(uint256 tokenId, uint256 amount) external {
        (, Position storage position) = _requirePositionManager(tokenId);

        _accrue(position);

        uint256 payAmount = Math.min(amount, position.principal + position.accruedInterest);
        if (payAmount == 0) {
            revert ZeroRepayment();
        }

        _applyDebtPayment(position, payAmount);
        USDC.safeTransferFrom(msg.sender, address(creditPool), payAmount);

        emit DebtRepaid(tokenId, payAmount);
    }

    /// @notice Sell exact `stockAmount` of this position's recorded stock for USDC and apply proceeds to debt.
    /// @dev Accrues first, requires `LIVE` pricing on the position's oracle, then sells through that asset's
    ///      execution adapter. Enforces caller `minOut` and the protocol oracle floor inside the adapter.
    ///      Realized USDC settles through the same `_settleProceeds` waterfall `liquidate` uses.
    function reduceExposure(uint256 tokenId, uint256 stockAmount, uint256 minOut) external {
        (address owner, Position storage position) = _requirePositionManager(tokenId);
        if (stockAmount == 0) {
            revert ZeroStockAmount();
        }
        uint256 available = position.stockAmount;
        if (stockAmount > available) {
            revert ExcessStockAmount(stockAmount, available);
        }

        _accrue(position);

        AssetConfig storage asset = _requireAsset(position.assetId);
        IOracleAdapter.Observation memory observation = _requireLivePrice(asset.oracle);

        // Deduct recorded stock before the swap so a reentrant callback cannot sell the same units twice.
        position.stockAmount = available - stockAmount;

        uint256 usdcOut = _sellStock(asset, stockAmount, minOut, observation.price);
        _settleProceeds(tokenId, position, owner, usdcOut);

        emit ExposureReduced(tokenId, stockAmount, usdcOut);
    }

    /// @notice Permissionless full unwind of an unhealthy financed position under LIVE pricing.
    /// @dev Accrues first, requires LIVE on the position's oracle, then gates on the same shared risk predicate as
    ///      `riskSnapshot`. Sells the entire recorded stock bag through that asset's execution path, settles debt
    ///      to `CreditPool`, surplus to the owner, and any unpaid remainder as `BadDebtRealized`. Always burns.
    function liquidate(uint256 tokenId) external {
        address owner = _requireOwned(tokenId);
        Position storage position = _positions[tokenId];
        AssetConfig storage asset = _requireAsset(position.assetId);

        _accrue(position);

        IOracleAdapter.Observation memory observation = _requireLivePrice(asset.oracle);

        uint256 checkpointDebt = position.principal + position.accruedInterest;
        if (!_riskSnapshot(position, asset.oracle, observation.price, checkpointDebt).liquidatable) {
            revert NotLiquidatable(tokenId);
        }

        uint256 stockAmount = position.stockAmount;
        position.stockAmount = 0;

        uint256 usdcOut = stockAmount == 0 ? 0 : _sellStock(asset, stockAmount, 0, observation.price);

        uint256 shortfall = _settleProceeds(tokenId, position, owner, usdcOut);
        if (shortfall != 0) {
            emit BadDebtRealized(tokenId, shortfall);
        }

        delete _positions[tokenId];
        _burn(tokenId);

        emit PositionLiquidated(tokenId, owner, stockAmount, usdcOut);
    }

    /// @notice Principal plus accrued-interest checkpoint plus unaccrued simple interest through now.
    /// @dev Oracle-free and keeper-free. Interest is charged only while principal is outstanding, at the immutable
    ///      V1 10% APR. Spot opens stay at zero debt.
    function currentDebt(uint256 tokenId) public view returns (uint256) {
        return _currentDebt(_positions[tokenId]);
    }

    /// @notice Full position record for a token id. Returns the zero struct when the token does not exist.
    function positions(uint256 tokenId) external view returns (Position memory) {
        return _positions[tokenId];
    }

    /// @notice LIVE-only risk view: oracle NAV, current debt, and the liquidation verdict.
    /// @dev Requires a live token and `LIVE` pricing on the position's asset oracle.
    function riskSnapshot(uint256 tokenId) external view returns (RiskSnapshot memory) {
        _requireOwned(tokenId);
        Position storage position = _positions[tokenId];
        AssetConfig storage asset = _requireAsset(position.assetId);
        return _riskSnapshot(position, asset.oracle, _requireLivePrice(asset.oracle).price, _currentDebt(position));
    }

    /// @notice Minimal identity metadata for a live Position NFT. Full living presentation is owned by a later slice.
    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        string memory json = string.concat(
            '{"name":"Margin Call Position ', Strings.toString(tokenId), '","description":"Margin Call Position NFT"}'
        );
        return string.concat("data:application/json;base64,", Base64.encode(bytes(json)));
    }

    /// @dev Clear the executor on a real ownership transfer before any `safeTransferFrom` receiver callback.
    function _update(address to, uint256 tokenId, address auth) internal override returns (address from) {
        from = super._update(to, tokenId, auth);
        if (from != address(0) && to != address(0) && from != to) {
            _positions[tokenId].executor = address(0);
        }
    }

    function _openFinanced(
        AssetConfig storage asset,
        uint256 contributedStock,
        uint256 targetLeverage,
        uint256 minStockOut
    ) private returns (uint256 finalStock, uint256 principal) {
        ICreditPool pool = creditPool;
        if (address(pool) == address(0)) {
            revert InvalidCreditPool();
        }

        IOracleAdapter oracle = asset.oracle;
        IExecutionAdapter execution = asset.execution;
        IOracleAdapter.Observation memory observation = _requireLivePrice(oracle);

        uint256 contributionValue = oracle.valueUsdc(contributedStock, observation.price);
        principal = _sizePrincipal(contributionValue, targetLeverage);
        if (principal == 0) {
            revert ContributionTooSmall(contributionValue);
        }

        pool.draw(principal);

        USDC.forceApprove(address(execution), principal);
        uint256 bought = execution.buyStock(principal, minStockOut, observation.price);
        USDC.forceApprove(address(execution), 0);

        finalStock = contributedStock + bought;
        uint256 nav = oracle.valueUsdc(finalStock, observation.price);
        _requireLeverageWithinCeiling(nav, principal, targetLeverage);
    }

    function _requireAsset(uint256 assetId) private view returns (AssetConfig storage asset) {
        asset = _assets[assetId];
        if (asset.stock == address(0)) {
            revert UnknownAsset(assetId);
        }
    }

    function _requirePositionOwner(uint256 tokenId) private view returns (address owner) {
        owner = _requireOwned(tokenId);
        if (msg.sender != owner) {
            revert NotPositionOwner(msg.sender, owner);
        }
    }

    function _requirePositionManager(uint256 tokenId) private view returns (address owner, Position storage position) {
        owner = _requireOwned(tokenId);
        position = _positions[tokenId];
        address executor = position.executor;
        if (msg.sender != owner && msg.sender != executor) {
            revert NotPositionManager(msg.sender, owner, executor);
        }
    }

    function _requireLivePrice(IOracleAdapter oracle)
        private
        view
        returns (IOracleAdapter.Observation memory observation)
    {
        observation = oracle.latestObservation();
        if (observation.state != IOracleAdapter.State.LIVE) {
            revert OracleNotLive(observation.state);
        }
    }

    function _currentDebt(Position storage position) private view returns (uint256) {
        return position.principal + position.accruedInterest + _pendingInterest(position);
    }

    function _riskSnapshot(Position storage position, IOracleAdapter oracle, uint256 price, uint256 debt)
        private
        view
        returns (RiskSnapshot memory snap)
    {
        snap.nav = oracle.valueUsdc(position.stockAmount, price);
        snap.currentDebt = debt;
        snap.liquidatable = V1Config.isLiquidatable(snap.nav, debt);
    }

    function _sellStock(AssetConfig storage asset, uint256 stockAmount, uint256 minOut, uint256 price)
        private
        returns (uint256 usdcOut)
    {
        IERC20 stock = IERC20(asset.stock);
        IExecutionAdapter execution = asset.execution;
        stock.forceApprove(address(execution), stockAmount);
        usdcOut = execution.sellStock(stockAmount, minOut, price);
        stock.forceApprove(address(execution), 0);
    }

    function _settleProceeds(uint256 tokenId, Position storage position, address owner, uint256 usdcOut)
        private
        returns (uint256 shortfall)
    {
        uint256 debt = position.principal + position.accruedInterest;
        uint256 repayAmount = Math.min(usdcOut, debt);
        if (repayAmount != 0) {
            _applyDebtPayment(position, repayAmount);
            USDC.safeTransfer(address(creditPool), repayAmount);
            emit DebtRepaid(tokenId, repayAmount);
        }

        if (usdcOut > repayAmount) {
            USDC.safeTransfer(owner, usdcOut - repayAmount);
        }

        shortfall = debt - repayAmount;
    }

    function _applyDebtPayment(Position storage position, uint256 payAmount) private {
        uint256 accrued = position.accruedInterest;
        uint256 interestPay = Math.min(payAmount, accrued);
        position.accruedInterest = accrued - interestPay;
        position.principal -= payAmount - interestPay;
    }

    function _pendingInterest(Position storage position) private view returns (uint256) {
        uint256 principal = position.principal;
        uint256 lastAccruedAt = position.lastAccruedAt;
        if (principal == 0 || block.timestamp <= lastAccruedAt) {
            return 0;
        }
        return _unaccruedInterest(principal, block.timestamp - lastAccruedAt);
    }

    function _accrue(Position storage position) private {
        uint256 pending = _pendingInterest(position);
        if (pending != 0) {
            position.accruedInterest += pending;
        }
        position.lastAccruedAt = block.timestamp;
    }

    function _unaccruedInterest(uint256 principal, uint256 elapsed) private pure returns (uint256) {
        return Math.mulDiv(
            principal,
            V1Config.BORROW_APR_BPS * elapsed,
            V1Config.BPS_DENOMINATOR * V1Config.SECONDS_PER_YEAR,
            Math.Rounding.Floor
        );
    }

    function _sizePrincipal(uint256 contributionValue, uint256 targetLeverage) private pure returns (uint256) {
        uint256 ideal =
            Math.mulDiv(contributionValue, targetLeverage - BPS_DENOMINATOR, BPS_DENOMINATOR, Math.Rounding.Floor);
        return Math.mulDiv(ideal, V1Config.ADVERSE_BOUND_BPS, V1Config.BPS_DENOMINATOR, Math.Rounding.Floor);
    }

    function _requireLeverageWithinCeiling(uint256 nav, uint256 debt, uint256 targetLeverage) private pure {
        if (debt >= nav) {
            revert LeverageExceeded(targetLeverage, nav, debt);
        }
        if (nav * BPS_DENOMINATOR > (nav - debt) * targetLeverage) {
            revert LeverageExceeded(targetLeverage, nav, debt);
        }
    }
}
