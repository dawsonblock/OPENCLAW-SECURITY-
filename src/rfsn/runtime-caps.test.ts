import { describe, expect, test } from "vitest";
import { resolveRfsnRuntimeCapabilities } from "./runtime-caps.js";

describe("resolveRfsnRuntimeCapabilities", () => {
  test("grants proc:manage only when sandboxed", () => {
    expect(resolveRfsnRuntimeCapabilities({ sandboxed: true })).toContain("proc:manage");
    expect(resolveRfsnRuntimeCapabilities({ sandboxed: false })).not.toContain("proc:manage");
  });

  test("maps messaging and inline button capabilities", () => {
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
    const caps = resolveRfsnRuntimeCapabilities({
      sandboxed: true,
      channelCapabilities: ["inlineButtons"],
      messageToolEnabled: false,
    });
    expect(caps).not.toContain("net:messaging");
    expect(caps).toContain("net:messaging:inlinebuttons");
  });
});
