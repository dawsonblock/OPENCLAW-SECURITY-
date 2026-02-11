import { describe, expect, test } from "vitest";
import { resolveRfsnRuntimeCapabilities } from "./runtime-caps.js";

describe("resolveRfsnRuntimeCapabilities", () => {
  const originalUnsafeEvalFlag = process.env.OPENCLAW_BROWSER_ALLOW_UNSAFE_EVAL;
  const originalRequireSignedPolicy = process.env.OPENCLAW_RFSN_REQUIRE_SIGNED_POLICY;

  function restoreUnsafeEvalFlag() {
    if (typeof originalUnsafeEvalFlag === "string") {
      process.env.OPENCLAW_BROWSER_ALLOW_UNSAFE_EVAL = originalUnsafeEvalFlag;
    } else {
      delete process.env.OPENCLAW_BROWSER_ALLOW_UNSAFE_EVAL;
    }
    if (typeof originalRequireSignedPolicy === "string") {
      process.env.OPENCLAW_RFSN_REQUIRE_SIGNED_POLICY = originalRequireSignedPolicy;
    } else {
      delete process.env.OPENCLAW_RFSN_REQUIRE_SIGNED_POLICY;
    }
  }

  test("grants proc:manage only when sandboxed", () => {
    restoreUnsafeEvalFlag();
    expect(resolveRfsnRuntimeCapabilities({ sandboxed: true })).toContain("proc:manage");
    expect(resolveRfsnRuntimeCapabilities({ sandboxed: false })).not.toContain("proc:manage");
  });

  test("maps messaging and inline button capabilities", () => {
    restoreUnsafeEvalFlag();
    const caps = resolveRfsnRuntimeCapabilities({
      sandboxed: true,
      channelCapabilities: ["inlineButtons", "tts"],
      messageToolEnabled: true,
    });
    expect(caps).toContain("net:messaging");
    expect(caps).toContain("net:messaging:inlinebuttons");
    expect(caps).toContain("net:tts");
  });

  test("does not grant messaging when message tool is disabled", () => {
    restoreUnsafeEvalFlag();
    const caps = resolveRfsnRuntimeCapabilities({
      sandboxed: true,
      channelCapabilities: ["inlineButtons"],
      messageToolEnabled: false,
    });
    expect(caps).not.toContain("net:messaging");
    expect(caps).toContain("net:messaging:inlinebuttons");
  });

  test("grants browser:unsafe_eval only when explicit env flag is enabled", () => {
    delete process.env.OPENCLAW_RFSN_REQUIRE_SIGNED_POLICY;
    delete process.env.OPENCLAW_BROWSER_ALLOW_UNSAFE_EVAL;
    expect(resolveRfsnRuntimeCapabilities({ sandboxed: false })).not.toContain(
      "browser:unsafe_eval",
    );

    process.env.OPENCLAW_BROWSER_ALLOW_UNSAFE_EVAL = "1";
    expect(resolveRfsnRuntimeCapabilities({ sandboxed: false })).toContain("browser:unsafe_eval");
    restoreUnsafeEvalFlag();
  });

  test("does not grant browser:unsafe_eval from env when signed policy is required", () => {
    process.env.OPENCLAW_RFSN_REQUIRE_SIGNED_POLICY = "1";
    process.env.OPENCLAW_BROWSER_ALLOW_UNSAFE_EVAL = "1";
    expect(resolveRfsnRuntimeCapabilities({ sandboxed: false })).not.toContain(
      "browser:unsafe_eval",
    );
    restoreUnsafeEvalFlag();
  });
});
