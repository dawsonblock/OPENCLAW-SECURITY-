import { describe, expect, it } from "vitest";
import { hashPayload, stableJson } from "./stable-hash.js";

describe("stable-hash", () => {
  it("produces stable JSON regardless of key order", () => {
    const a = stableJson({ b: 1, a: { y: 2, x: 3 } });
    const b = stableJson({ a: { x: 3, y: 2 }, b: 1 });
    expect(a).toBe(b);
  });

  it("hashes semantically identical payloads to same digest", () => {
    const left = hashPayload({ command: ["echo", "ok"], cwd: "/tmp", env: { LANG: "C" } });
    const right = hashPayload({ env: { LANG: "C" }, cwd: "/tmp", command: ["echo", "ok"] });
    expect(left).toBe(right);
  });

  it("throws on circular objects", () => {
    const obj: Record<string, unknown> = {};
    obj.self = obj;
    expect(() => stableJson(obj)).toThrow(/circular/i);
  });
});
