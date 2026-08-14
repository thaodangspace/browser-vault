import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    pool: "threads",
    // Browser and real-process integration tests get a deliberately longer bound.
    testTimeout: 15_000,
  },
});
