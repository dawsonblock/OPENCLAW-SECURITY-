function parseBooleanFlag(value: string | undefined): boolean {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();
  if (!normalized) {
    return false;
  }
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function isUnsafeBrowserEvalEnvEnabled(): boolean {
  return parseBooleanFlag(process.env.OPENCLAW_BROWSER_ALLOW_UNSAFE_EVAL);
}

export function requestUsesUnsafeBrowserEval(request: unknown): boolean {
  if (!isRecord(request)) {
    return false;
  }
  const kind = typeof request.kind === "string" ? request.kind.trim().toLowerCase() : "";
  if (kind === "evaluate") {
    return true;
  }
  if (kind === "wait") {
    const fn = typeof request.fn === "string" ? request.fn.trim() : "";
    return fn.length > 0;
  }
  return false;
}

export function isUnsafeEvalDisallowedForProfile(params: {
  profile?: string;
  driver?: string;
}): boolean {
  if (params.driver?.trim().toLowerCase() === "extension") {
    return true;
  }
  const profile = params.profile?.trim().toLowerCase();
  return profile === "chrome";
}

export function resolveUnsafeBrowserEvalDecision(params: {
  configEvaluateEnabled: boolean;
  profile?: string;
  driver?: string;
}): { allowed: true } | { allowed: false; reason: string } {
  if (!params.configEvaluateEnabled) {
    return {
      allowed: false,
      reason: "browser unsafe eval is disabled by config (browser.evaluateEnabled=false).",
    };
  }
  if (!isUnsafeBrowserEvalEnvEnabled()) {
    return {
      allowed: false,
      reason:
        "browser unsafe eval is disabled by default. Set OPENCLAW_BROWSER_ALLOW_UNSAFE_EVAL=1 to enable.",
    };
  }
  if (isUnsafeEvalDisallowedForProfile(params)) {
    return {
      allowed: false,
      reason:
        "browser unsafe eval is blocked for Chrome extension profiles. Use an isolated aetherbot profile.",
    };
  }
  return { allowed: true };
}
