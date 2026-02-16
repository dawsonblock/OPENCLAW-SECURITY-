import { describe, expect, it } from "vitest";
import { getDefaultRedactPatterns, redactSensitiveText, redactStructuredFields } from "./redact.js";

const defaults = getDefaultRedactPatterns();

describe("redactSensitiveText", () => {
  it("masks env assignments while keeping the key", () => {
    const input = "OPENAI_API_KEY=sk-1234567890abcdef";
    const output = redactSensitiveText(input, {
      mode: "tools",
      patterns: defaults,
    });
    expect(output).toBe("OPENAI_API_KEY=sk-123…cdef");
  });

  it("masks CLI flags", () => {
    const input = "curl --token abcdef1234567890ghij https://api.test";
    const output = redactSensitiveText(input, {
      mode: "tools",
      patterns: defaults,
    });
    expect(output).toBe("curl --token abcdef…ghij https://api.test");
  });

  it("masks JSON fields", () => {
    const input = '{"token":"abcdef1234567890ghij"}';
    const output = redactSensitiveText(input, {
      mode: "tools",
      patterns: defaults,
    });
    expect(output).toBe('{"token":"abcdef…ghij"}');
  });

  it("masks bearer tokens", () => {
    const input = "Authorization: Bearer abcdef1234567890ghij";
    const output = redactSensitiveText(input, {
      mode: "tools",
      patterns: defaults,
    });
    expect(output).toBe("Authorization: Bearer abcdef…ghij");
  });

  it("masks Telegram-style tokens", () => {
    const input = "123456:ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef";
    const output = redactSensitiveText(input, {
      mode: "tools",
      patterns: defaults,
    });
    expect(output).toBe("123456…cdef");
  });

  it("redacts short tokens fully", () => {
    const input = "TOKEN=shortvalue";
    const output = redactSensitiveText(input, {
      mode: "tools",
      patterns: defaults,
    });
    expect(output).toBe("TOKEN=***");
  });

  it("redacts private key blocks", () => {
    const input = [
      "-----BEGIN PRIVATE KEY-----",
      "ABCDEF1234567890",
      "ZYXWVUT987654321",
      "-----END PRIVATE KEY-----",
    ].join("\n");
    const output = redactSensitiveText(input, {
      mode: "tools",
      patterns: defaults,
    });
    expect(output).toBe(
      ["-----BEGIN PRIVATE KEY-----", "…redacted…", "-----END PRIVATE KEY-----"].join("\n"),
    );
  });

  it("honors custom patterns with flags", () => {
    const input = "token=abcdef1234567890ghij";
    const output = redactSensitiveText(input, {
      mode: "tools",
      patterns: ["/token=([A-Za-z0-9]+)/i"],
    });
    expect(output).toBe("token=abcdef…ghij");
  });

  it("masks token query parameters with default patterns", () => {
    const input = "https://example.com/path?token=abcdef1234567890ghij&ok=1";
    const output = redactSensitiveText(input, {
      mode: "tools",
      patterns: defaults,
    });
    expect(output).toContain("token=");
    expect(output).toContain("&ok=1");
    expect(output).not.toContain("abcdef1234567890ghij");
  });

  it("skips redaction when mode is off", () => {
    const input = "OPENAI_API_KEY=sk-1234567890abcdef";
    const output = redactSensitiveText(input, {
      mode: "off",
      patterns: defaults,
    });
    expect(output).toBe(input);
  });
});

describe("redactStructuredFields", () => {
  it("redacts known sensitive field names", () => {
    const input = {
      command: "system.run",
      approvalToken: "secret-token-value",
      capabilityApprovalToken: "another-token",
      sessionKey: "session-123",
    };
    const result = redactStructuredFields(input) as Record<string, unknown>;
    expect(result.command).toBe("system.run");
    expect(result.approvalToken).toBe("[REDACTED]");
    expect(result.capabilityApprovalToken).toBe("[REDACTED]");
    expect(result.sessionKey).toBe("[REDACTED]");
  });

  it("handles nested objects recursively", () => {
    const input = { outer: { apiKey: "sk-12345", safe: "hello" } };
    const result = redactStructuredFields(input) as Record<string, Record<string, unknown>>;
    expect(result.outer.apiKey).toBe("[REDACTED]");
    expect(result.outer.safe).toBe("hello");
  });

  it("handles arrays", () => {
    const input = [{ token: "abc" }, { password: "pass123" }];
    const result = redactStructuredFields(input) as Array<Record<string, unknown>>;
    expect(result[0].token).toBe("[REDACTED]");
    expect(result[1].password).toBe("[REDACTED]");
  });

  it("preserves non-string sensitive field values", () => {
    const input = { token: 42, apiKey: null };
    const result = redactStructuredFields(input) as Record<string, unknown>;
    expect(result.token).toBe(42);
    expect(result.apiKey).toBeNull();
  });

  it("passes through primitives", () => {
    expect(redactStructuredFields("hello")).toBe("hello");
    expect(redactStructuredFields(null)).toBeNull();
    expect(redactStructuredFields(undefined)).toBeUndefined();
  });
});
