import { describe, expect, test } from "vitest";
import { BoundedMap } from "./bounded-map.js";

describe("BoundedMap", () => {
  test("stores and retrieves values", () => {
    const map = new BoundedMap<string, number>({ maxSize: 10 });
    map.set("a", 1);
    expect(map.get("a")).toBe(1);
    expect(map.size).toBe(1);
  });

  test("evicts oldest entries when exceeding maxSize", () => {
    const map = new BoundedMap<string, number>({ maxSize: 3 });
    map.set("a", 1);
    map.set("b", 2);
    map.set("c", 3);
    map.set("d", 4); // "a" should be evicted
    expect(map.size).toBe(3);
    expect(map.has("a")).toBe(false);
    expect(map.has("b")).toBe(true);
    expect(map.has("d")).toBe(true);
  });

  test("respects TTL", () => {
    const map = new BoundedMap<string, number>({ maxSize: 10, ttlMs: 1000 });
    const now = 10_000;
    map.set("a", 1, now);
    expect(map.get("a", now + 500)).toBe(1); // within TTL
    expect(map.get("a", now + 1001)).toBeUndefined(); // expired
  });

  test("purgeExpired removes stale entries", () => {
    const map = new BoundedMap<string, number>({ maxSize: 10, ttlMs: 100 });
    const now = 10_000;
    map.set("a", 1, now);
    map.set("b", 2, now);
    map.set("c", 3, now + 200); // fresh
    const purged = map.purgeExpired(now + 150);
    expect(purged).toBe(2);
    expect(map.size).toBe(1);
    expect(map.has("c", now + 200)).toBe(true);
  });

  test("delete removes entry", () => {
    const map = new BoundedMap<string, number>({ maxSize: 10 });
    map.set("a", 1);
    expect(map.delete("a")).toBe(true);
    expect(map.has("a")).toBe(false);
  });

  test("clear removes all entries", () => {
    const map = new BoundedMap<string, number>({ maxSize: 10 });
    map.set("a", 1);
    map.set("b", 2);
    map.clear();
    expect(map.size).toBe(0);
  });

  test("set refreshes entry position", () => {
    const map = new BoundedMap<string, number>({ maxSize: 3 });
    map.set("a", 1);
    map.set("b", 2);
    map.set("c", 3);
    map.set("a", 10); // refresh "a" — "b" is now oldest
    map.set("d", 4); // "b" should be evicted
    expect(map.has("b")).toBe(false);
    expect(map.get("a")).toBe(10);
    expect(map.has("d")).toBe(true);
  });

  test("purgeExpired returns 0 when no TTL", () => {
    const map = new BoundedMap<string, number>({ maxSize: 10 });
    map.set("a", 1);
    expect(map.purgeExpired()).toBe(0);
  });
});
