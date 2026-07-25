# Keep custody contracts non-upgradeable

Window, lot, trader, account, and settlement logic will not change underneath deposited inventory or active positions. Economic configuration remains versioned and adjustable only between Window sessions, while breaking contract changes require a new deployment; emergency controls stop new risk but never block refunds, claims, matured withdrawals, or cracks.
