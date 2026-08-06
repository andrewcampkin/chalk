import { afterEach } from "vitest";
import { closeAllTestDbs } from "./helpers";

// Close every test database before the worker exits. See closeAllTestDbs.
afterEach(() => {
  closeAllTestDbs();
});
