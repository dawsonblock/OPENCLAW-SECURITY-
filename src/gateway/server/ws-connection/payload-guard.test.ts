import { describe, expect, it } from "vitest";
import { guardInboundPayload } from "./payload-guard.js";

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
    const parsed = JSON.parse('{"type":"req","id":"1","params":{"__proto__":{"x":1}}}') as unknown;
    const result = guardInboundPayload(parsed);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("__proto__");
    }
  });

  it("rejects constructor.prototype pollution chains", () => {
    const parsed = JSON.parse(
      '{"type":"req","id":"1","params":{"constructor":{"prototype":{"x":1}}}}',
    ) as unknown;
    const result = guardInboundPayload(parsed);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("constructor.prototype");
    }
  });

  it("rejects overly deep payloads", () => {
    const deep = { root: {} as Record<string, unknown> };
    let cursor = deep.root;
    for (let i = 0; i < 45; i += 1) {
      cursor.next = {};
      cursor = cursor.next as Record<string, unknown>;
    }
    const result = guardInboundPayload(deep, { maxDepth: 40 });
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
    const result = guardInboundPayload({ params: payload }, { maxKeys: 5 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("key count");
    }
  });
});
