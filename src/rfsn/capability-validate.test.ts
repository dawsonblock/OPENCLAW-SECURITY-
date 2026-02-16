import { describe, expect, test } from "vitest";
import { validateCapabilities } from "./capability-validate.js";

describe("validateCapabilities", () => {
  test("rejects browser unsafe eval without browser capability", () => {
    expect(() => validateCapabilities(["browser:unsafe_eval"])).toThrow(
      /browser_unsafe_eval_requires_net_browser/,
    );
  });

  test("rejects host exec capability", () => {
    expect(() => validateCapabilities(["exec:host"])).toThrow(/exec_host_forbidden/);
  });

  test("allows valid capability combinations", () => {
    expect(() => validateCapabilities(["net:browser", "browser:unsafe_eval"])).not.toThrow();
    expect(() => validateCapabilities(["proc:manage"])).not.toThrow();
  });
});
