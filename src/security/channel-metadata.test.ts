import { describe, expect, it } from "vitest";
import { buildUntrustedChannelMetadata } from "./channel-metadata.js";

describe("buildUntrustedChannelMetadata", () => {
  it("returns undefined when all entries are empty or null", () => {
    const result = buildUntrustedChannelMetadata({
      source: "telegram",
      label: "Group",
      entries: [null, undefined, "   ", ""],
    });
    expect(result).toBeUndefined();
  });

  it("returns undefined when entries array is empty", () => {
    const result = buildUntrustedChannelMetadata({
      source: "telegram",
      label: "Group",
      entries: [],
    });
    expect(result).toBeUndefined();
  });

  it("wraps a single valid entry in an external content block", () => {
    const result = buildUntrustedChannelMetadata({
      source: "discord",
      label: "Channel",
      entries: ["general"],
    });
    expect(result).toBeDefined();
    expect(result).toContain("UNTRUSTED channel metadata");
    expect(result).toContain("discord");
    expect(result).toContain("general");
  });

  it("normalizes whitespace in entries", () => {
    const result = buildUntrustedChannelMetadata({
      source: "slack",
      label: "Workspace",
      entries: ["hello   world"],
    });
    expect(result).toBeDefined();
    // Collapsed whitespace should appear
    expect(result).toContain("hello world");
  });

  it("deduplicates identical entries", () => {
    const result = buildUntrustedChannelMetadata({
      source: "telegram",
      label: "Group",
      entries: ["alpha", "alpha", "beta", "alpha"],
    });
    expect(result).toBeDefined();
    // "alpha" should only appear once in the body
    const occurrences = (result ?? "").split("alpha").length - 1;
    expect(occurrences).toBe(1);
    expect(result).toContain("beta");
  });

  it("truncates an entry that exceeds the per-entry limit", () => {
    const longEntry = "a".repeat(500);
    const result = buildUntrustedChannelMetadata({
      source: "whatsapp",
      label: "Contact",
      entries: [longEntry],
    });
    expect(result).toBeDefined();
    // The entry should be truncated and end with "..."
    expect(result).toContain("...");
  });

  it("truncates the entire metadata block when it exceeds maxChars", () => {
    const entries = Array.from({ length: 10 }, (_, i) => `entry-${i}-${"x".repeat(100)}`);
    const result = buildUntrustedChannelMetadata({
      source: "line",
      label: "Room",
      entries,
      maxChars: 200,
    });
    expect(result).toBeDefined();
    // Block should be truncated
    const len = (result ?? "").length;
    // The raw content would be much longer; truncation must have applied
    expect(len).toBeLessThan(500);
    expect(result).toContain("...");
  });

  it("includes the label and source in the output", () => {
    const result = buildUntrustedChannelMetadata({
      source: "matrix",
      label: "Room name",
      entries: ["some-room"],
    });
    expect(result).toContain("matrix");
    expect(result).toContain("Room name");
  });

  it("omits includeWarning from external-content wrapper (no extra injection warning)", () => {
    const result = buildUntrustedChannelMetadata({
      source: "telegram",
      label: "Chat",
      entries: ["test"],
    });
    expect(result).toBeDefined();
    // The wrapper should still be present, but without the extra warning text
    expect(result).toContain("UNTRUSTED channel metadata");
    expect(result).toContain("telegram");
    expect(result).toContain("Chat");
    expect(result).not.toContain("SECURITY NOTICE:");
  });

  it("handles a mix of null, undefined, and valid entries", () => {
    const result = buildUntrustedChannelMetadata({
      source: "slack",
      label: "Channel",
      entries: [null, "valid-entry", undefined, "another"],
    });
    expect(result).toBeDefined();
    expect(result).toContain("valid-entry");
    expect(result).toContain("another");
  });
});
