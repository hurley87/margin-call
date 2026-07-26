// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {TraderIdentity} from "./TraderIdentity.sol";

/// @notice Delegated agent authority for Trader identities, scoped to an
///         authority epoch.
/// @dev Agent keys never receive raw token-bound-account control. They are
///      authorized only for named protocol actions against named contracts, so
///      a compromised key cannot make arbitrary calls from the account.
///
///      Every grant records the Trader's authority epoch. Because a transfer
///      advances that epoch, a sale retires every delegated key at once —
///      without an unbounded loop and without needing the departing owner to
///      cooperate in a revocation. Grants are likewise inert while the Trader
///      is unclaimed, which is what keeps automation paused until the new owner
///      has reviewed it.
///
///      Spend limits are deliberately absent. A per-fill or daily cap can only
///      be enforced where the spend is observed, so those live with the
///      settlement contract rather than being recorded here as a control this
///      contract cannot apply.
contract TraderDelegation {
    uint256 public constant ACTION_QUOTE = 1 << 0;
    uint256 public constant ACTION_FILL = 1 << 1;
    uint256 public constant ACTION_CANCEL = 1 << 2;
    uint256 public constant ACTION_CRACK = 1 << 3;

    /// @dev Every currently defined action. Grants may not request bits outside
    ///      this set, so a later action cannot be pre-authorized by a grant
    ///      written before it existed.
    uint256 public constant ACTION_ALL = ACTION_QUOTE | ACTION_FILL | ACTION_CANCEL | ACTION_CRACK;

    /// @dev Upper bound on how long a single grant may live. Bounds the blast
    ///      radius of a leaked key for an owner who stops paying attention.
    uint64 public constant MAX_DELEGATION_DURATION = 30 days;

    struct Delegation {
        uint64 epoch;
        uint64 generation;
        uint64 expiresAt;
        uint256 actions;
    }

    TraderIdentity public immutable identity;

    mapping(uint256 => mapping(address => Delegation)) private _delegations;
    mapping(uint256 => uint64) private _generation;
    mapping(bytes32 => bool) private _targets;

    event DelegationGranted(
        uint256 indexed tokenId, address indexed agentKey, uint64 epoch, uint64 expiresAt, uint256 actions
    );
    event DelegationTargetAllowed(uint256 indexed tokenId, address indexed agentKey, address indexed target);
    event DelegationRevoked(uint256 indexed tokenId, address indexed agentKey);
    event DelegationsRevokedAll(uint256 indexed tokenId, uint64 generation);

    constructor(address identity_) {
        require(identity_ != address(0), "Zero identity");
        identity = TraderIdentity(identity_);
    }

    modifier onlyTraderOwner(uint256 tokenId) {
        require(msg.sender == identity.ownerOf(tokenId), "Not trader owner");
        _;
    }

    /// @notice Authorize `agentKey` to take `actions` against `targets`.
    /// @dev Overwrites any previous grant for the same key. Only the current
    ///      owner of a claimed Trader may grant.
    function grant(uint256 tokenId, address agentKey, uint256 actions, address[] calldata targets, uint64 expiresAt)
        external
        onlyTraderOwner(tokenId)
    {
        require(agentKey != address(0), "Zero agent key");
        require(identity.isClaimed(tokenId), "Trader unclaimed");
        require(actions != 0 && actions & ~ACTION_ALL == 0, "Invalid actions");
        require(targets.length != 0, "No targets");
        require(expiresAt > block.timestamp, "Expiry in past");
        require(expiresAt <= block.timestamp + MAX_DELEGATION_DURATION, "Expiry too far");

        uint64 epoch = identity.authorityEpoch(tokenId);
        uint64 generation = _generation[tokenId];

        _delegations[tokenId][agentKey] =
            Delegation({epoch: epoch, generation: generation, expiresAt: expiresAt, actions: actions});

        for (uint256 i = 0; i < targets.length; i++) {
            address target = targets[i];
            require(target != address(0), "Zero target");
            _targets[_targetKey(tokenId, agentKey, epoch, generation, target)] = true;
            emit DelegationTargetAllowed(tokenId, agentKey, target);
        }

        emit DelegationGranted(tokenId, agentKey, epoch, expiresAt, actions);
    }

    /// @notice Revoke a single agent key immediately.
    function revoke(uint256 tokenId, address agentKey) external onlyTraderOwner(tokenId) {
        require(_delegations[tokenId][agentKey].expiresAt != 0, "No delegation");
        delete _delegations[tokenId][agentKey];
        emit DelegationRevoked(tokenId, agentKey);
    }

    /// @notice Revoke every agent key for a Trader in one transaction.
    /// @dev Advances a generation counter rather than iterating keys, so the
    ///      cost does not grow with the number of grants.
    function revokeAll(uint256 tokenId) external onlyTraderOwner(tokenId) {
        uint64 generation = _generation[tokenId] + 1;
        _generation[tokenId] = generation;
        emit DelegationsRevokedAll(tokenId, generation);
    }

    /// @notice Whether `agentKey` may take `action` against `target` right now.
    function isAuthorized(uint256 tokenId, address agentKey, uint256 action, address target)
        public
        view
        returns (bool)
    {
        Delegation storage d = _delegations[tokenId][agentKey];

        if (d.expiresAt == 0 || block.timestamp >= d.expiresAt) return false;
        if (action == 0 || d.actions & action != action) return false;
        if (d.generation != _generation[tokenId]) return false;
        if (d.epoch != identity.authorityEpoch(tokenId)) return false;
        if (!identity.isClaimed(tokenId)) return false;

        return _targets[_targetKey(tokenId, agentKey, d.epoch, d.generation, target)];
    }

    /// @notice Revert-on-failure form for protocol contracts.
    function assertAuthorized(uint256 tokenId, address agentKey, uint256 action, address target) external view {
        require(isAuthorized(tokenId, agentKey, action, target), "Agent not authorized");
    }

    function delegationOf(uint256 tokenId, address agentKey) external view returns (Delegation memory) {
        return _delegations[tokenId][agentKey];
    }

    function generationOf(uint256 tokenId) external view returns (uint64) {
        return _generation[tokenId];
    }

    function isTargetAllowed(uint256 tokenId, address agentKey, address target) external view returns (bool) {
        Delegation storage d = _delegations[tokenId][agentKey];
        return _targets[_targetKey(tokenId, agentKey, d.epoch, d.generation, target)];
    }

    function _targetKey(uint256 tokenId, address agentKey, uint64 epoch, uint64 generation, address target)
        private
        pure
        returns (bytes32)
    {
        return keccak256(abi.encode(tokenId, agentKey, epoch, generation, target));
    }
}
