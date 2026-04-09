import { describe, expect, test } from "vitest";
import { createDefaultRfsnPolicy } from "./policy.js";
import { normalizeToolArgs } from "./tool-args.js";

describe("normalizeToolArgs", () => {
  test("denies exec unknown fields", () => {
    const policy = createDefaultRfsnPolicy();
    const normalized = normalizeToolArgs({
      toolName: "exec",
      args: { command: "ls", surprise: true },
      policy,
      sandboxed: true,
    });
    expect(normalized.ok).toBe(false);
    if (!normalized.ok) {
      expect(normalized.reasons).toContain("invalid:args:unknown_field:surprise");
    }
  });

  test("forces sandbox-only exec args", () => {
    const policy = createDefaultRfsnPolicy();
    const normalized = normalizeToolArgs({
      toolName: "exec",
      args: { command: "ls" },
      policy,
      sandboxed: true,
    });
    expect(normalized.ok).toBe(true);
    if (normalized.ok) {
      expect(normalized.value).toMatchObject({
        command: "ls",
        host: "sandbox",
        elevated: false,
      });
    }
  });

  test("denies host override and elevated exec args", () => {
    const policy = createDefaultRfsnPolicy();
    const normalized = normalizeToolArgs({
      toolName: "exec",
      args: {
        command: "ls",
        host: "gateway",
        elevated: true,
      },
      policy,
      sandboxed: true,
    });
    expect(normalized.ok).toBe(false);
    if (!normalized.ok) {
      expect(normalized.reasons).toContain("policy:exec_host_forbidden:gateway");
      expect(normalized.reasons).toContain("policy:exec_elevated_forbidden");
    }
  });

  test("denies malformed web_fetch args", () => {
    const policy = createDefaultRfsnPolicy();
    const normalized = normalizeToolArgs({
      toolName: "web_fetch",
      args: { url: "https://example.com", maxChars: 1 },
      policy,
      sandboxed: true,
    });
    expect(normalized.ok).toBe(false);
    if (!normalized.ok) {
      expect(normalized.reasons).toContain("invalid:web_fetch:maxChars");
    }
  });
});
