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
