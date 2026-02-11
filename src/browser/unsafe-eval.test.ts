import { afterEach, describe, expect, test } from "vitest";
import { requestUsesUnsafeBrowserEval, resolveUnsafeBrowserEvalDecision } from "./unsafe-eval.js";

const ORIGINAL_FLAG = process.env.OPENCLAW_BROWSER_ALLOW_UNSAFE_EVAL;

afterEach(() => {
  if (typeof ORIGINAL_FLAG === "string") {
    process.env.OPENCLAW_BROWSER_ALLOW_UNSAFE_EVAL = ORIGINAL_FLAG;
  } else {
    delete process.env.OPENCLAW_BROWSER_ALLOW_UNSAFE_EVAL;
  }
});

describe("unsafe browser eval helpers", () => {
  test("detects evaluate/wait.fn requests", () => {
    expect(requestUsesUnsafeBrowserEval({ kind: "evaluate", fn: "() => 1" })).toBe(true);
    expect(requestUsesUnsafeBrowserEval({ kind: "wait", fn: "() => window.ready" })).toBe(true);
    expect(requestUsesUnsafeBrowserEval({ kind: "wait", timeMs: 1000 })).toBe(false);
    expect(requestUsesUnsafeBrowserEval({ kind: "click", ref: "e1" })).toBe(false);
  });

  test("requires explicit env flag and blocks extension profiles", () => {
    delete process.env.OPENCLAW_BROWSER_ALLOW_UNSAFE_EVAL;
    expect(
      resolveUnsafeBrowserEvalDecision({
        configEvaluateEnabled: true,
        profile: "openclaw",
      }),
    ).toMatchObject({ allowed: false });

    process.env.OPENCLAW_BROWSER_ALLOW_UNSAFE_EVAL = "1";
    expect(
      resolveUnsafeBrowserEvalDecision({
        configEvaluateEnabled: true,
        profile: "openclaw",
      }),
    ).toMatchObject({ allowed: true });

    expect(
      resolveUnsafeBrowserEvalDecision({
        configEvaluateEnabled: true,
        profile: "chrome",
      }),
    ).toMatchObject({ allowed: false });
  });
});
