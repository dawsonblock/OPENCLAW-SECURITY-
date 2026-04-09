const DEFAULT_MAX_MESSAGE_BYTES = 2 * 1024 * 1024;
const DEFAULT_MAX_DEPTH = 30;
const DEFAULT_MAX_KEYS = 10_000;
const DEFAULT_MAX_STRING_BYTES = 256 * 1024;

export type IngressGuardOptions = {
  maxMessageBytes?: number;
  maxDepth?: number;
  maxKeys?: number;
  maxStringBytes?: number;
};

export type IngressGuardResult = { ok: true } | { ok: false; reason: string };

function normalizeLimit(value: number | undefined, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(1, Math.floor(value));
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function rejectForbiddenKey(key: string): string | null {
  if (key === "__proto__" || key === "constructor" || key === "prototype") {
    return `payload contains forbidden key (${key})`;
  }
  return null;
}

function validateTopLevelShape(value: unknown): IngressGuardResult {
  if (!isPlainRecord(value)) {
    return { ok: false, reason: "top-level payload must be a JSON object" };
  }
  if (typeof value.type !== "string") {
    return { ok: false, reason: "top-level payload missing string type" };
  }
  if (value.type !== "req") {
    return { ok: false, reason: `unsupported top-level frame type (${value.type})` };
  }
  if (typeof value.id !== "string" || !value.id.trim()) {
    return { ok: false, reason: "request frame missing id" };
  }
  if (typeof value.method !== "string" || !value.method.trim()) {
    return { ok: false, reason: "request frame missing method" };
  }
  return { ok: true };
}

export function guardInboundJsonText(
  text: string,
  options?: IngressGuardOptions,
): IngressGuardResult {
  const maxMessageBytes = normalizeLimit(options?.maxMessageBytes, DEFAULT_MAX_MESSAGE_BYTES);
  if (Buffer.byteLength(text, "utf8") > maxMessageBytes) {
    return { ok: false, reason: `payload exceeds max message size (${maxMessageBytes} bytes)` };
  }
  return { ok: true };
}

export function guardInboundPayload(
  value: unknown,
  options?: IngressGuardOptions,
): IngressGuardResult {
  const maxDepth = normalizeLimit(options?.maxDepth, DEFAULT_MAX_DEPTH);
  const maxKeys = normalizeLimit(options?.maxKeys, DEFAULT_MAX_KEYS);
  const maxStringBytes = normalizeLimit(options?.maxStringBytes, DEFAULT_MAX_STRING_BYTES);

  const topLevel = validateTopLevelShape(value);
  if (!topLevel.ok) {
    return topLevel;
  }

  const stack: Array<{ value: unknown; depth: number }> = [{ value, depth: 0 }];
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
    if (typeof current === "string") {
      if (Buffer.byteLength(current, "utf8") > maxStringBytes) {
        return { ok: false, reason: `payload string exceeds size limit (${maxStringBytes} bytes)` };
      }
      continue;
    }
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

    if (!isPlainRecord(current)) {
      return { ok: false, reason: "payload contains unsupported object shape" };
    }

    const keys = Object.keys(current);
    keyCount += keys.length;
    if (keyCount > maxKeys) {
      return { ok: false, reason: `payload key count exceeds limit (${maxKeys})` };
    }

    for (const key of keys) {
      const forbiddenReason = rejectForbiddenKey(key);
      if (forbiddenReason) {
        return { ok: false, reason: forbiddenReason };
      }
      stack.push({ value: current[key], depth: entry.depth + 1 });
    }
  }

  return { ok: true };
}

export const ingressGuardDefaults = {
  maxMessageBytes: DEFAULT_MAX_MESSAGE_BYTES,
  maxDepth: DEFAULT_MAX_DEPTH,
  maxKeys: DEFAULT_MAX_KEYS,
  maxStringBytes: DEFAULT_MAX_STRING_BYTES,
};
