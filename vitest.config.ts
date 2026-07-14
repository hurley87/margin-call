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
      NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL: "https://sepolia.base.org",
      ESCROW_ADDRESS: "0x9A7Ca01E00be0717d28509E1fdC2a8543dE86D03",
      NEXT_PUBLIC_ESCROW_ADDRESS: "0x9A7Ca01E00be0717d28509E1fdC2a8543dE86D03",
      SEAT_VAULT_ADDRESS: "0xA901DFC8C46faF3A24F4002849dE98dFE9722C95",
      NEXT_PUBLIC_SEAT_VAULT_ADDRESS:
        "0xA901DFC8C46faF3A24F4002849dE98dFE9722C95",
      NEXT_PUBLIC_MARGINCALL_TOKEN_ADDRESS:
        "0x0d93099c1b24C848e7A7DD77c5a50de0735A60d7",
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
