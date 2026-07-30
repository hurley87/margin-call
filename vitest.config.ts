import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    // Skip scheduling wallet:createForTrader during Vitest — convex-test executes
    // that internal action with incomplete transaction context (runQuery throws).
    env: {
      MC_SKIP_WALLET_SCHEDULE: "1",
      AGENT_CYCLES_ENABLED: "1",
    },
    include: [
      "src/**/*.test.ts",
      "src/**/*.test.tsx",
      "packages/shared/**/*.test.ts",
      "tests/convex/**/*.test.ts",
    ],
    exclude: ["**/node_modules/**"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@margin-call/shared": path.resolve(
        __dirname,
        "./packages/shared/src/index.ts"
      ),
    },
  },
});
