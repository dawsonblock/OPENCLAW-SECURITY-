const SECRET_PATTERNS = [
  /sk-[a-zA-Z0-9]{20,}/g, // Generic sk- prefix (OpenAI, etc.)
  /gh[pousr]-[a-zA-Z0-9]{36}/g, // GitHub tokens
  /xox[baprs]-[a-zA-Z0-9]{10,}/g, // Slack tokens
  /AIza[0-9A-Za-z-_]{35}/g, // Google API keys
  /eyJ[a-zA-Z0-9-_]+(\.[a-zA-Z0-9-_]+){2}/g, // JWTs (heuristic)
  /AKIA[0-9A-Z]{16}/g, // AWS Access Key ID
  /sq0csp-[0-9A-Za-z\-_]{43}/g, // Square Access Token
  /access_token\$production\$[0-9a-z]{16}\$[0-9a-f]{32}/g, // PayPal Access Token
];

export function scrubString(text: string): { scrubbed: string; redacted: boolean } {
  let redacted = false;
  let result = text;

  for (const pattern of SECRET_PATTERNS) {
    // Reset lastIndex for global regexes just in case
    pattern.lastIndex = 0;
    if (pattern.test(result)) {
      redacted = true;
      result = result.replace(pattern, "[REDACTED_SECRET]");
    }
  }
  return { scrubbed: result, redacted };
}

export function containsRawSecret(text: string): boolean {
  for (const pattern of SECRET_PATTERNS) {
    pattern.lastIndex = 0;
    if (pattern.test(text)) {
      return true;
    }
  }
  return false;
}

export function scrubDeep(value: unknown): unknown {
  if (typeof value === "string") {
    // Check if it looks like a secret
    if (containsRawSecret(value)) {
      return scrubString(value).scrubbed;
    }
    return value;
  }
  if (value === null || value === undefined) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(scrubDeep);
  }
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      // We also scrub keys if they contain secrets (unlikely but possible)
      const cleanedKey = containsRawSecret(key) ? scrubString(key).scrubbed : key;
      out[cleanedKey] = scrubDeep(entry);
    }
    return out;
  }
  return value;
}
