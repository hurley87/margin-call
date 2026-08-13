import { defineConfig } from "vitest/config";
import path from "path";

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
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@margin-call/shared": path.resolve(
        __dirname,
        "./packages/shared/src/index.ts"
      ),
      "@margin-call/shared/margin-call-voice": path.resolve(
        __dirname,
        "./packages/shared/src/margin-call-voice.ts"
      ),
      "@margin-call/shared/crash-keeper": path.resolve(
        __dirname,
        "./packages/shared/src/crash-keeper.ts"
      ),
      "@margin-call/shared/address": path.resolve(
        __dirname,
        "./packages/shared/src/address.ts"
      ),
      "@margin-call/shared/parse-private-key": path.resolve(
        __dirname,
        "./packages/shared/src/parse-private-key.ts"
      ),
    },
  },
});
