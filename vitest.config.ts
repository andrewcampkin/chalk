import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // infra/ is the AWS stack and has its own toolchain; `npm test` is the app.
    exclude: ["infra/**", "node_modules/**"],
    // Closes the in-memory SQLite handles after each test. Without this the
    // native destructors run after Node has torn down the environment, and the
    // worker dies with an assertion instead of a failing test.
    setupFiles: ["./tests/setup.ts"],
  },
});
