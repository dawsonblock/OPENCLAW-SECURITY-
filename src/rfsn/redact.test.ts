import { describe, expect, it } from "vitest";
import { redactForLedger } from "./redact.js";

describe("redactForLedger", () => {
  it("redacts bearer tokens in strings", () => {
    const out = redactForLedger({
      message: "Authorization: Bearer abcdef1234567890token",
    }) as { message: string };
    expect(out.message).toContain("Bearer [REDACTED]");
  });

  it("redacts query parameter secrets in strings", () => {
    const out = redactForLedger({
      url: "https://example.com/path?token=abc123&access_token=xyz789&ok=1",
    }) as { url: string };
    expect(out.url).toContain("token=[REDACTED]");
    expect(out.url).toContain("access_token=[REDACTED]");
    expect(out.url).not.toContain("abc123");
    expect(out.url).not.toContain("xyz789");
  });

  it("redacts common token prefixes in strings", () => {
    const out = redactForLedger({
      value: "sk-abcdefghijklmnop ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ1234",
    }) as { value: string };
    expect(out.value).toBe("[REDACTED] [REDACTED]");
  });
});
