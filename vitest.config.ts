import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Closes the in-memory SQLite handles after each test. Without this the
    // native destructors run after Node has torn down the environment, and the
    // worker dies with an assertion instead of a failing test.
    setupFiles: ["./tests/setup.ts"],
  },
});
