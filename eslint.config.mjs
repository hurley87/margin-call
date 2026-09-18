import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@privy-io", "@privy-io/*"],
              message:
                "Privy has been removed. Use the Dynamic wallet foundation instead.",
            },
          ],
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "**/.next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Local agent worktrees can contain nested Next.js output; never lint them
    ".claude/**",
    // Foundry deps (gitignored, installed via pnpm install:forge-deps) and artifacts
    "contracts/lib/**",
    "contracts/out/**",
    "contracts/cache/**",
    "contracts/broadcast/**",
    "contracts/via_ir-out/**",
  ]),
]);

export default eslintConfig;
