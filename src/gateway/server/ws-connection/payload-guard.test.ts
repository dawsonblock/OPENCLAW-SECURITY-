import { describe, expect, it } from "vitest";
import { guardInboundJsonText, guardInboundPayload } from "./payload-guard.js";

describe("guardInboundPayload", () => {
  it("accepts a normal request payload", () => {
    const result = guardInboundPayload({
      type: "req",
      id: "1",
      method: "node.invoke",
      params: { nodeId: "node-1", command: "system.notify", params: { title: "ok" } },
    });
    expect(result).toEqual({ ok: true });
  });

  it("rejects __proto__ keys", () => {
    const parsed = JSON.parse(
      '{"type":"req","id":"1","method":"node.invoke","params":{"__proto__":{"x":1}}}',
    ) as unknown;
    const result = guardInboundPayload(parsed);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("__proto__");
    }
  });

  it("rejects constructor keys", () => {
    const parsed = JSON.parse(
      '{"type":"req","id":"1","method":"node.invoke","params":{"constructor":{"prototype":{"x":1}}}}',
    ) as unknown;
    const result = guardInboundPayload(parsed);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("constructor");
    }
  });

  it("rejects overly deep payloads", () => {
    const deep = { type: "req", id: "1", method: "node.invoke", params: { root: {} } } as {
      type: string;
      id: string;
      method: string;
      params: { root: Record<string, unknown> };
    };
    let cursor = deep.params.root;
    for (let i = 0; i < 35; i += 1) {
      cursor.next = {};
      cursor = cursor.next as Record<string, unknown>;
    }
    const result = guardInboundPayload(deep, { maxDepth: 30 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("max depth");
    }
  });

  it("rejects payloads with excessive key count", () => {
    const payload: Record<string, unknown> = {};
    for (let i = 0; i < 10; i += 1) {
      payload[`k${i}`] = i;
    }
    const result = guardInboundPayload(
      { type: "req", id: "1", method: "node.invoke", params: payload },
      { maxKeys: 5 },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("key count");
    }
  });

  it("rejects strings larger than the configured limit", () => {
    const result = guardInboundPayload(
      {
        type: "req",
        id: "1",
        method: "node.invoke",
        params: { large: "x".repeat(16) },
      },
      { maxStringBytes: 8 },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("string exceeds");
    }
  });

  it("rejects oversized raw JSON messages", () => {
    const result = guardInboundJsonText("x".repeat(16), { maxMessageBytes: 8 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("max message size");
    }
  });

  it("rejects unknown top-level payload shape", () => {
    const result = guardInboundPayload({ type: "res", id: "1", ok: true });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("top-level frame type");
    }
  });
});
