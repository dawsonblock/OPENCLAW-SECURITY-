const DEFAULT_MAX_DEPTH = 40;
const DEFAULT_MAX_KEYS = 20_000;

export type PayloadGuardOptions = {
  maxDepth?: number;
  maxKeys?: number;
};

export type PayloadGuardResult = { ok: true } | { ok: false; reason: string };

function normalizeLimit(value: number | undefined, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(1, Math.floor(value));
}

function hasOwn(value: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function guardInboundPayload(
  value: unknown,
  options?: PayloadGuardOptions,
): PayloadGuardResult {
  const maxDepth = normalizeLimit(options?.maxDepth, DEFAULT_MAX_DEPTH);
  const maxKeys = normalizeLimit(options?.maxKeys, DEFAULT_MAX_KEYS);
  const stack: Array<{ value: unknown; depth: number; parentKey?: string }> = [{ value, depth: 0 }];
  const seen = new Set<unknown>();
  let keyCount = 0;

  while (stack.length > 0) {
    const entry = stack.pop();
    if (!entry) {
      continue;
    }
    if (entry.depth > maxDepth) {
      return { ok: false, reason: `payload nesting exceeds max depth (${maxDepth})` };
    }
    const current = entry.value;
    if (!current || typeof current !== "object") {
      continue;
    }
    if (seen.has(current)) {
      continue;
    }
    seen.add(current);

    if (Array.isArray(current)) {
      for (const item of current) {
        stack.push({ value: item, depth: entry.depth + 1 });
      }
      continue;
    }

    const keys = Object.keys(current);
    keyCount += keys.length;
    if (keyCount > maxKeys) {
      return { ok: false, reason: `payload key count exceeds limit (${maxKeys})` };
    }

    for (const key of keys) {
      const child = (current as Record<string, unknown>)[key];
      if (key === "__proto__") {
        return { ok: false, reason: "payload contains forbidden key (__proto__)" };
      }
      if (entry.parentKey === "constructor" && key === "prototype") {
        return { ok: false, reason: "payload contains forbidden constructor.prototype chain" };
      }
      if (
        key === "constructor" &&
        isObjectRecord(child) &&
        hasOwn(child, "prototype") &&
        isObjectRecord(child.prototype)
      ) {
        return { ok: false, reason: "payload contains forbidden constructor.prototype chain" };
      }
      stack.push({ value: child, depth: entry.depth + 1, parentKey: key });
    }
  }

  return { ok: true };
}
