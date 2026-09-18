import { defineConfig } from "vitest/config";
import path from "path";

const sharedAlias = [
  {
    find: "@margin-call/shared/address",
    replacement: path.resolve(__dirname, "./packages/shared/src/address.ts"),
  },
  {
    find: "@margin-call/shared/margin-call-events",
    replacement: path.resolve(
      __dirname,
      "./packages/shared/src/margin-call-events.ts"
    ),
  },
  {
    find: "@margin-call/shared/parse-private-key",
    replacement: path.resolve(
      __dirname,
      "./packages/shared/src/parse-private-key.ts"
    ),
  },
  {
    find: "@margin-call/shared/thesis",
    replacement: path.resolve(__dirname, "./packages/shared/src/thesis.ts"),
  },
  {
    find: "@margin-call/shared",
    replacement: path.resolve(__dirname, "./packages/shared/src/index.ts"),
  },
  {
    find: "@",
    replacement: path.resolve(__dirname, "./src"),
  },
];

// Longer @margin-call/shared/* aliases must precede the package root alias so
// Vite does not resolve subpaths against index.ts.
export default defineConfig({
  test: {
    projects: [
      {
        resolve: { alias: sharedAlias },
        test: {
          name: "unit",
          environment: "node",
          include: [
            "src/**/*.test.ts",
            "src/**/*.test.tsx",
            "packages/shared/**/*.test.ts",
            "tests/scripts/**/*.test.ts",
          ],
          exclude: ["**/node_modules/**", "tests/convex/**"],
        },
      },
      {
        resolve: { alias: sharedAlias },
        test: {
          name: "convex",
          environment: "edge-runtime",
          include: ["tests/convex/**/*.test.ts"],
          exclude: ["**/node_modules/**"],
        },
      },
    ],
  },
});
