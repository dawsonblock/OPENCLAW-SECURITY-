import { createHash } from "node:crypto";

const DEFAULT_MAX_DEPTH = 40;
const DEFAULT_MAX_KEYS = 10_000;

type StableOptions = {
  maxDepth?: number;
  maxKeys?: number;
};

function normalizeLimit(value: number | undefined, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(1, Math.floor(value));
}

export function stableJson(value: unknown, options?: StableOptions): string {
  const maxDepth = normalizeLimit(options?.maxDepth, DEFAULT_MAX_DEPTH);
  const maxKeys = normalizeLimit(options?.maxKeys, DEFAULT_MAX_KEYS);
  const seen = new WeakSet<object>();
  let keyCount = 0;

  const normalize = (input: unknown, depth: number): unknown => {
    if (depth > maxDepth) {
      throw new Error(`stableJson: max depth exceeded (${maxDepth})`);
    }
    if (Array.isArray(input)) {
      return input.map((entry) => normalize(entry, depth + 1));
    }
    if (!input || typeof input !== "object") {
      return input;
    }
    const objectValue = input as Record<string, unknown>;
    if (seen.has(objectValue)) {
      throw new Error("stableJson: circular reference detected");
    }
    seen.add(objectValue);

    const obj = objectValue;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(obj).toSorted()) {
      keyCount += 1;
      if (keyCount > maxKeys) {
        throw new Error(`stableJson: max key count exceeded (${maxKeys})`);
      }
      sorted[key] = normalize(obj[key], depth + 1);
    }
    return sorted;
  };

  return JSON.stringify(normalize(value, 0));
}

export function sha256Hex(data: string): string {
  return createHash("sha256").update(data).digest("hex");
}

export function hashPayload(value: unknown, options?: StableOptions): string {
  return sha256Hex(stableJson(value, options));
}
