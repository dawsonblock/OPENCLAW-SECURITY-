import { describe, expect, it } from "vitest";
import {
  guardInboundJsonText,
  guardInboundPayload,
  ingressGuardDefaults,
} from "./ingress-guard.js";

describe("ingressGuardDefaults", () => {
  it("exposes the expected default limits", () => {
    expect(ingressGuardDefaults.maxMessageBytes).toBe(2 * 1024 * 1024);
    expect(ingressGuardDefaults.maxDepth).toBe(30);
    expect(ingressGuardDefaults.maxKeys).toBe(10_000);
    expect(ingressGuardDefaults.maxStringBytes).toBe(256 * 1024);
  });
});

describe("guardInboundJsonText", () => {
  it("accepts a small text payload", () => {
    const result = guardInboundJsonText('{"type":"req","id":"1","method":"ping"}');
    expect(result.ok).toBe(true);
  });

  it("rejects a payload that exceeds maxMessageBytes", () => {
    const huge = "x".repeat(3 * 1024 * 1024);
    const result = guardInboundJsonText(huge);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toMatch(/max message size/);
    }
  });

  it("accepts payload exactly at maxMessageBytes using a custom limit", () => {
    const small = "a".repeat(10);
    const result = guardInboundJsonText(small, { maxMessageBytes: 10 });
    expect(result.ok).toBe(true);
  });

  it("rejects payload one byte over a custom limit", () => {
    const small = "a".repeat(11);
    const result = guardInboundJsonText(small, { maxMessageBytes: 10 });
    expect(result.ok).toBe(false);
  });

  it("treats non-finite maxMessageBytes as the default", () => {
    // Non-finite option falls back to default (2MB), so a small payload is fine
    const result = guardInboundJsonText("hello", { maxMessageBytes: NaN });
    expect(result.ok).toBe(true);
  });
});

describe("guardInboundPayload", () => {
  const validFrame = { type: "req", id: "abc", method: "ping" };

  it("accepts a valid minimal request frame", () => {
    expect(guardInboundPayload(validFrame).ok).toBe(true);
  });

  it("rejects a non-object payload", () => {
    const result = guardInboundPayload("string");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toMatch(/JSON object/);
    }
  });

  it("rejects an array at the top level", () => {
    const result = guardInboundPayload([]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toMatch(/JSON object/);
    }
  });

  it("rejects a frame missing type", () => {
    const result = guardInboundPayload({ id: "1", method: "ping" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toMatch(/type/);
    }
  });

  it("rejects a frame with non-string type", () => {
    const result = guardInboundPayload({ type: 42, id: "1", method: "ping" });
    expect(result.ok).toBe(false);
  });

  it("rejects a frame with unsupported type", () => {
    const result = guardInboundPayload({ type: "event", id: "1", method: "ping" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toMatch(/unsupported/);
    }
  });

  it("rejects a frame missing id", () => {
    const result = guardInboundPayload({ type: "req", method: "ping" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toMatch(/id/);
    }
  });

  it("rejects a frame with empty id", () => {
    const result = guardInboundPayload({ type: "req", id: "   ", method: "ping" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toMatch(/id/);
    }
  });

  it("rejects a frame missing method", () => {
    const result = guardInboundPayload({ type: "req", id: "1" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toMatch(/method/);
    }
  });

  it("rejects a frame with empty method", () => {
    const result = guardInboundPayload({ type: "req", id: "1", method: "" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toMatch(/method/);
    }
  });

  it("rejects a nested payload with __proto__ key", () => {
    // Use Object.create + defineProperty so __proto__ is an own enumerable key
    // rather than setting the prototype (as object literal __proto__ would do).
    const data = Object.create(Object.prototype) as Record<string, unknown>;
    Object.defineProperty(data, "__proto__", {
      value: {},
      enumerable: true,
      configurable: true,
      writable: true,
    });
    const result = guardInboundPayload({ type: "req", id: "1", method: "ping", data });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toMatch(/forbidden key/);
    }
  });

  it("rejects a payload with constructor key", () => {
    const payload = Object.create(null) as Record<string, unknown>;
    payload.type = "req";
    payload.id = "1";
    payload.method = "ping";
    payload.constructor = "bad";
    const result = guardInboundPayload(payload);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toMatch(/forbidden key/);
    }
  });

  it("rejects a payload with prototype key", () => {
    const payload = Object.create(null) as Record<string, unknown>;
    payload.type = "req";
    payload.id = "1";
    payload.method = "ping";
    payload.prototype = "bad";
    const result = guardInboundPayload(payload);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toMatch(/forbidden key/);
    }
  });

  it("rejects deeply nested objects beyond maxDepth", () => {
    // Build a chain 5 levels deep
    let inner: Record<string, unknown> = { leaf: "value" };
    for (let i = 0; i < 5; i++) {
      inner = { child: inner };
    }
    const result = guardInboundPayload(
      { type: "req", id: "1", method: "ping", data: inner },
      { maxDepth: 2 },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toMatch(/depth/);
    }
  });

  it("accepts a nested object within maxDepth", () => {
    const nested = { a: { b: "value" } };
    const result = guardInboundPayload(
      { type: "req", id: "1", method: "ping", data: nested },
      { maxDepth: 10 },
    );
    expect(result.ok).toBe(true);
  });

  it("rejects a payload with too many keys", () => {
    const many: Record<string, number> = {};
    for (let i = 0; i < 20; i++) {
      many[`k${i}`] = i;
    }
    const result = guardInboundPayload(
      { type: "req", id: "1", method: "ping", data: many },
      { maxKeys: 5 },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toMatch(/key count/);
    }
  });

  it("rejects a payload containing an oversized string", () => {
    const bigString = "x".repeat(300 * 1024);
    const result = guardInboundPayload(
      { type: "req", id: "1", method: "ping", data: bigString },
      { maxStringBytes: 1024 },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toMatch(/string/);
    }
  });

  it("accepts payload with arrays of primitives", () => {
    const result = guardInboundPayload({
      type: "req",
      id: "1",
      method: "ping",
      args: [1, 2, 3, "hello"],
    });
    expect(result.ok).toBe(true);
  });

  it("handles circular references gracefully (via seen set)", () => {
    const obj: Record<string, unknown> = { type: "req", id: "1", method: "ping" };
    const child: Record<string, unknown> = { parent: obj };
    obj.child = child;
    // Should not throw - the seen set breaks cycles
    expect(() => guardInboundPayload(obj)).not.toThrow();
    const result = guardInboundPayload(obj);
    expect(result.ok).toBe(true);
  });

  it("rejects a non-plain-object nested value", () => {
    // A Date is not a plain object
    const result = guardInboundPayload({
      type: "req",
      id: "1",
      method: "ping",
      data: new Date(),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toMatch(/unsupported object shape/);
    }
  });
});
