import type { RfsnPolicy } from "./policy.js";

type Ok<T> = { ok: true; value: T };
type Fail = { ok: false; reasons: string[] };
type Result<T> = Ok<T> | Fail;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

type PickStrictResult<T> =
  | { ok: true; value: Partial<T>; unknownFields: string[] }
  | { ok: false; reasons: string[] };

function pickStrict<T extends Record<string, unknown>>(
  obj: Record<string, unknown>,
  allowedKeys: readonly string[],
): PickStrictResult<T> {
  const unknownFields: string[] = [];
  const allowed = new Set(allowedKeys);
  for (const key of Object.keys(obj)) {
    if (!allowed.has(key)) {
      unknownFields.push(key);
    }
  }
  if (unknownFields.length > 0) {
    return {
      ok: false,
      reasons: unknownFields.map((field) => `invalid:args:unknown_field:${field}`),
    };
  }
  const out: Partial<T> = {};
  for (const key of allowedKeys) {
    if (key in obj) {
      out[key as keyof T] = obj[key] as T[keyof T];
    }
  }
  return { ok: true, value: out, unknownFields };
}

function normalizeHost(value: unknown): "sandbox" | "gateway" | "node" | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === "sandbox" || normalized === "gateway" || normalized === "node") {
    return normalized;
  }
  return null;
}

function normalizeSecurity(value: unknown): "deny" | "allowlist" | "full" | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === "deny" || normalized === "allowlist" || normalized === "full") {
    return normalized;
  }
  return null;
}

function normalizeAsk(value: unknown): "off" | "on-miss" | "always" | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === "off" || normalized === "on-miss" || normalized === "always") {
    return normalized;
  }
  return null;
}

export type ExecArgsNormalized = {
  command: string;
  workdir?: string;
  yieldMs?: number;
  background?: boolean;
  timeout?: number;
  pty?: boolean;
  host: "sandbox" | "gateway" | "node";
  security?: "deny" | "allowlist" | "full";
  ask?: "off" | "on-miss" | "always";
  node?: string;
  elevated?: boolean;
  env?: Record<string, string>;
};

export function normalizeExecArgs(params: {
  args: unknown;
  policy: RfsnPolicy;
  sandboxed?: boolean;
}): Result<ExecArgsNormalized> {
  if (!isRecord(params.args)) {
    return { ok: false, reasons: ["invalid:args:not_object"] };
  }

  const strict = pickStrict<ExecArgsNormalized>(params.args, [
    "command",
    "workdir",
    "yieldMs",
    "background",
    "timeout",
    "pty",
    "host",
    "security",
    "ask",
    "node",
    "elevated",
    "env",
  ] as const);
  if (!strict.ok) {
    return strict;
  }

  const reasons: string[] = [];
  const out = strict.value;

  const command = typeof out.command === "string" ? out.command.trim() : "";
  if (!command) {
    reasons.push("policy:exec_command_required");
  }

  if (out.workdir !== undefined && typeof out.workdir !== "string") {
    reasons.push("invalid:exec:workdir");
  }
  if (
    out.yieldMs !== undefined &&
    (typeof out.yieldMs !== "number" || !Number.isFinite(out.yieldMs) || out.yieldMs < 0)
  ) {
    reasons.push("invalid:exec:yieldMs");
  }
  if (out.background !== undefined && typeof out.background !== "boolean") {
    reasons.push("invalid:exec:background");
  }
  if (
    out.timeout !== undefined &&
    (typeof out.timeout !== "number" || !Number.isFinite(out.timeout) || out.timeout < 0)
  ) {
    reasons.push("invalid:exec:timeout");
  }
  if (out.pty !== undefined && typeof out.pty !== "boolean") {
    reasons.push("invalid:exec:pty");
  }
  if (reasons.length > 0) {
    return { ok: false, reasons };
  }

  const normalizedHostInput = out.host === undefined ? "sandbox" : normalizeHost(out.host);
  if (!normalizedHostInput) {
    return { ok: false, reasons: ["invalid:exec:host"] };
  }

  // Enforce sandbox-only host regardless of caller intent.
  if (normalizedHostInput !== "sandbox") {
    reasons.push(`policy:exec_host_forbidden:${normalizedHostInput}`);
  }

  let normalizedSecurity: ExecArgsNormalized["security"];
  if (out.security !== undefined) {
    normalizedSecurity = normalizeSecurity(out.security) ?? undefined;
    if (!normalizedSecurity) {
      reasons.push("invalid:exec:security");
    } else {
      reasons.push("policy:exec_security_forbidden");
    }
  }

  let normalizedAsk: ExecArgsNormalized["ask"];
  if (out.ask !== undefined) {
    normalizedAsk = normalizeAsk(out.ask) ?? undefined;
    if (!normalizedAsk) {
      reasons.push("invalid:exec:ask");
    } else {
      reasons.push("policy:exec_ask_forbidden");
    }
  }

  let normalizedNode: string | undefined;
  if (out.node !== undefined) {
    if (typeof out.node !== "string" || !out.node.trim()) {
      reasons.push("invalid:exec:node");
    } else {
      normalizedNode = out.node.trim();
      reasons.push("policy:exec_node_forbidden");
    }
  }

  let normalizedElevated: boolean | undefined;
  if (out.elevated !== undefined) {
    if (typeof out.elevated !== "boolean") {
      reasons.push("invalid:exec:elevated");
    } else {
      normalizedElevated = out.elevated;
      if (out.elevated) {
        reasons.push("policy:exec_elevated_forbidden");
      }
    }
  }

  let normalizedEnv: Record<string, string> | undefined;
  if (out.env !== undefined) {
    if (!isRecord(out.env)) {
      reasons.push("invalid:exec:env");
    } else {
      reasons.push("policy:exec_env_forbidden");
      const entries = Object.entries(out.env);
      const envRecord: Record<string, string> = {};
      for (const [key, value] of entries) {
        if (typeof value !== "string") {
          reasons.push(`invalid:exec:env_value:${key}`);
          continue;
        }
        envRecord[key] = value;
      }
      normalizedEnv = envRecord;
    }
  }

  if (reasons.length > 0) {
    return { ok: false, reasons };
  }

  return {
    ok: true,
    value: {
      command,
      workdir: out.workdir,
      yieldMs: out.yieldMs,
      background: out.background,
      timeout: out.timeout,
      pty: out.pty,
      host: normalizedHostInput,
      security: normalizedSecurity,
      ask: normalizedAsk,
      node: normalizedNode,
      elevated: normalizedElevated ?? false,
      env: normalizedEnv,
    },
  };
}

export type WebFetchArgsNormalized = {
  url: string;
  extractMode?: "markdown" | "text";
  maxChars?: number;
};

export function normalizeWebFetchArgs(args: unknown): Result<WebFetchArgsNormalized> {
  if (!isRecord(args)) {
    return { ok: false, reasons: ["invalid:args:not_object"] };
  }

  const strict = pickStrict<WebFetchArgsNormalized>(args, ["url", "extractMode", "maxChars"]);
  if (!strict.ok) {
    return strict;
  }

  const out = strict.value;
  const reasons: string[] = [];

  const url = typeof out.url === "string" ? out.url.trim() : "";
  if (!url) {
    reasons.push("policy:web_fetch_url_required");
  }

  let extractMode: WebFetchArgsNormalized["extractMode"];
  if (out.extractMode !== undefined) {
    const normalized = String(out.extractMode).trim().toLowerCase();
    if (normalized === "markdown" || normalized === "text") {
      extractMode = normalized;
    } else {
      reasons.push("invalid:web_fetch:extractMode");
    }
  }

  let maxChars: number | undefined;
  if (out.maxChars !== undefined) {
    const value = out.maxChars;
    if (typeof value !== "number" || !Number.isFinite(value) || value < 100) {
      reasons.push("invalid:web_fetch:maxChars");
    } else {
      maxChars = Math.floor(value);
    }
  }

  if (reasons.length > 0) {
    return { ok: false, reasons };
  }

  return {
    ok: true,
    value: {
      url,
      extractMode,
      maxChars,
    },
  };
}

export function normalizeToolArgs(params: {
  toolName: string;
  args: unknown;
  policy: RfsnPolicy;
  sandboxed?: boolean;
}): Result<unknown> {
  switch (params.toolName) {
    case "exec":
      return normalizeExecArgs({
        args: params.args,
        policy: params.policy,
        sandboxed: params.sandboxed,
      });
    case "web_fetch":
      return normalizeWebFetchArgs(params.args);
    default:
      return { ok: true, value: params.args };
  }
}
