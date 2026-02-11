const SECRET_KEY_RE =
  /(token|secret|password|authorization|cookie|api[_-]?key|bearer|jwt|session)/i;
const MAX_STRING_LEN = 1024;
const MAX_ARRAY_ITEMS = 64;
const MAX_DEPTH = 8;

function redactString(value: string): string {
  const bearerSanitized = value.replace(/bearer\s+[a-z0-9._-]+/gi, "Bearer [REDACTED]");
  const querySanitized = bearerSanitized.replace(
    /([?&#](?:token|access_token|api[_-]?key|secret|password)=)([^&#\s]+)/gi,
    "$1[REDACTED]",
  );
  const prefixSanitized = querySanitized.replace(
    /\b(sk-[A-Za-z0-9_-]{8,}|ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|xox[baprs]-[A-Za-z0-9-]{10,}|xapp-[A-Za-z0-9-]{10,}|gsk_[A-Za-z0-9_-]{10,}|AIza[0-9A-Za-z\-_]{20,}|pplx-[A-Za-z0-9_-]{10,}|npm_[A-Za-z0-9]{10,})\b/g,
    "[REDACTED]",
  );
  if (prefixSanitized.length <= MAX_STRING_LEN) {
    return prefixSanitized;
  }
  return `${prefixSanitized.slice(0, MAX_STRING_LEN)}...[truncated:${prefixSanitized.length}]`;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function redactValue(value: unknown, depth: number, seen: WeakSet<object>): unknown {
  if (value === null || value === undefined) {
    return value;
  }
  if (depth > MAX_DEPTH) {
    return "[MAX_DEPTH_REACHED]";
  }
  if (typeof value === "string") {
    return redactString(value);
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "bigint") {
    return value.toString();
  }
  if (Array.isArray(value)) {
    const limited = value.slice(0, MAX_ARRAY_ITEMS);
    const redacted = limited.map((item) => redactValue(item, depth + 1, seen));
    if (value.length > MAX_ARRAY_ITEMS) {
      redacted.push(`[+${value.length - MAX_ARRAY_ITEMS} more items]`);
    }
    return redacted;
  }
  if (!isPlainObject(value)) {
    return Object.prototype.toString.call(value);
  }
  if (seen.has(value)) {
    return "[CIRCULAR]";
  }
  seen.add(value);
  const out: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value)) {
    if (SECRET_KEY_RE.test(key)) {
      out[key] = "[REDACTED]";
      continue;
    }
    out[key] = redactValue(nested, depth + 1, seen);
  }
  return out;
}

export function redactForLedger(value: unknown): unknown {
  return redactValue(value, 0, new WeakSet<object>());
}
