import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    // Skip scheduling wallet:createForTrader during Vitest — convex-test executes
    // that internal action with incomplete transaction context (runQuery throws).
    env: {
      MARGIN_CALL_CONVEX_TEST_SKIP_WALLET_SCHEDULE: "1",
    },
    include: [
      "src/**/*.test.ts",
      "src/**/*.test.tsx",
      "convex/__tests__/**/*.test.ts",
    ],
    exclude: ["**/node_modules/**", "contracts/lib/**"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
