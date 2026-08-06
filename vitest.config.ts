import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Closes the in-memory SQLite handles after each test. Without this the
    // native destructors run after Node has torn down the environment and the
    // worker dies with an assertion rather than a test failure.
    setupFiles: ["./tests/setup.ts"],

    // better-sqlite3's native teardown races with worker shutdown on Node
    // 24.19, surfacing as "Worker exited unexpectedly" with a native assertion
    // and no failing test to point at. One long-lived process avoids the
    // repeated fork/teardown cycle entirely. The suite runs in ~2s, so this
    // costs nothing and is deterministic.
    fileParallelism: false,
    pool: "forks",
    poolOptions: { forks: { singleFork: true } },
  },
});
