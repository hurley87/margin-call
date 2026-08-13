import { defineConfig } from "vitest/config";
import path from "path";

// Longer @margin-call/shared/* aliases must precede the package root alias so
// Vite does not resolve subpaths against index.ts.
export default defineConfig({
  test: {
    environment: "node",
    include: [
      "src/**/*.test.ts",
      "src/**/*.test.tsx",
      "packages/shared/**/*.test.ts",
      "tests/convex/**/*.test.ts",
      "tests/scripts/**/*.test.ts",
    ],
    exclude: ["**/node_modules/**"],
  },
  resolve: {
    alias: [
      {
        find: "@margin-call/shared/margin-call-voice",
        replacement: path.resolve(
          __dirname,
          "./packages/shared/src/margin-call-voice.ts"
        ),
      },
      {
        find: "@margin-call/shared/crash-outcome",
        replacement: path.resolve(
          __dirname,
          "./packages/shared/src/crash-outcome.ts"
        ),
      },
      {
        find: "@margin-call/shared/crash-keeper",
        replacement: path.resolve(
          __dirname,
          "./packages/shared/src/crash-keeper.ts"
        ),
      },
      {
        find: "@margin-call/shared/address",
        replacement: path.resolve(
          __dirname,
          "./packages/shared/src/address.ts"
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
        find: "@margin-call/shared",
        replacement: path.resolve(__dirname, "./packages/shared/src/index.ts"),
      },
      {
        find: "@",
        replacement: path.resolve(__dirname, "./src"),
      },
    ],
  },
});
