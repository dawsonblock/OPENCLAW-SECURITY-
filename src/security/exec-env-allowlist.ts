/**
 * Deny-by-default environment variable allowlist for exec planes.
 *
 * By default, only safe environment variable keys are inherited from the
 * gateway process. All others are stripped unless OPENCLAW_ALLOW_ARBITRARY_ENV=1.
 */

export const SAFE_ENV_KEYS = new Set([
  "PATH",
  "HOME",
  "LANG",
  "LC_ALL",
  "TMPDIR",
  "TERM",
  "SHELL",
  "USER",
  "LOGNAME",
  "TZ",
  "COLORTERM",
  "FORCE_COLOR",
  "NO_COLOR",
  "NODE_ENV",
]);

export type EnvSanitizeResult =
  | { ok: true; env: Record<string, string> }
  | { ok: false; reason: string; deniedKeys: string[] };

/**
 * Sanitize an environment record to only include safe keys.
 * Returns { ok: true, env } if the env is safe or was successfully stripped.
 * Returns { ok: false } if arbitrary env was provided without the break-glass.
 */
export function sanitizeExecEnv(
  env: Record<string, string> | undefined,
  options?: { allowArbitraryEnv?: boolean },
): EnvSanitizeResult {
  if (!env || Object.keys(env).length === 0) {
    return { ok: true, env: {} };
  }

  const deniedKeys: string[] = [];
  const sanitized: Record<string, string> = {};

  for (const [key, value] of Object.entries(env)) {
    if (SAFE_ENV_KEYS.has(key)) {
      sanitized[key] = value;
    } else {
      deniedKeys.push(key);
    }
  }

  if (deniedKeys.length === 0) {
    return { ok: true, env: sanitized };
  }

  if (options?.allowArbitraryEnv) {
    // Break-glass: pass through all env keys
    return { ok: true, env: { ...env } };
  }

  return {
    ok: false,
    reason: `denied env keys for exec: ${deniedKeys.join(", ")}; set OPENCLAW_ALLOW_ARBITRARY_ENV=1 to override`,
    deniedKeys,
  };
}

export function isArbitraryEnvAllowed(processEnv: NodeJS.ProcessEnv): boolean {
  const value = processEnv.OPENCLAW_ALLOW_ARBITRARY_ENV?.trim().toLowerCase();
  return value === "1" || value === "true";
}

export function getSafeEnvKeys(): string[] {
  return [...SAFE_ENV_KEYS];
}
