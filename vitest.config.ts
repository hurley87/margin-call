import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    // Skip async creation side effects during Vitest — convex-test executes
    // scheduled actions with incomplete external runtime context.
    env: {
      MC_SKIP_WALLET_SCHEDULE: "1",
      MC_SKIP_PORTRAIT_SCHEDULE: "1",
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
