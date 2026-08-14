/**
 * Published GitBook product docs. Synced from the repo `gitbook/` folder.
 * Keep paths stable — HUD and nav deep-link into How to Play.
 */
// Host path is the public GitBook space; allowlisted for secret-scan false positive.
export const PRODUCT_DOCS_URL =
  "https://margin-call.gitbook.io/product-docs" as const; // pragma: allowlist secret

export const HOW_TO_PLAY_URL = `${PRODUCT_DOCS_URL}/game/how-to-play` as const;
