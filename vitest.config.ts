import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    // Skip scheduling wallet:createForTrader during Vitest — convex-test executes
    // that internal action with incomplete transaction context (runQuery throws).
    env: {
      MC_SKIP_WALLET_SCHEDULE: "1",
      ESCROW_ADDRESS: "0xa244550f0e35032E9c0b09DA4EB4933848d28d16",
      NEXT_PUBLIC_ESCROW_ADDRESS: "0xa244550f0e35032E9c0b09DA4EB4933848d28d16",
    },
    include: [
      "src/**/*.test.ts",
      "src/**/*.test.tsx",
      "tests/convex/**/*.test.ts",
    ],
    exclude: ["**/node_modules/**", "contracts/lib/**"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
