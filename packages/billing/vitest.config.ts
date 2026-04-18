// @ts-expect-error vitest is not installed until `pnpm install` runs in
// this package; remove once devDependencies are populated.
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: false,
    include: ["tests/**/*.test.ts"],
  },
});
