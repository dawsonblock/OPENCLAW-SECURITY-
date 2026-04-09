import type { LookupFn } from "../infra/net/ssrf.js";
import { isTruthyEnvValue } from "../infra/env.js";
import { assertPublicHostname } from "../infra/net/ssrf.js";

const PROTECTED_HEADER_NAMES = new Set([
  "authorization",
  "proxy-authorization",
  "cookie",
  "set-cookie",
  "host",
  "content-length",
  "x-goog-api-key",
]);

export async function sanitizeRemoteBaseUrl(params: {
  baseUrl?: string;
  defaultBaseUrl: string;
  requireCustomHostOptIn?: boolean;
  allowCustomHostEnv?: string;
  allowPrivateHostEnv?: string;
  lookupFn?: LookupFn;
}): Promise<string> {
  const allowCustomHostEnv =
    params.allowCustomHostEnv ?? "OPENCLAW_ALLOW_CUSTOM_EMBEDDINGS_BASEURL";
  const allowPrivateHostEnv =
    params.allowPrivateHostEnv ?? "OPENCLAW_ALLOW_PRIVATE_EMBEDDINGS_BASEURL";
  const fallback = new URL(params.defaultBaseUrl);
  const rawBaseUrl = params.baseUrl?.trim();
  if (!rawBaseUrl) {
    return fallback.toString().replace(/\/+$/, "");
  }

  let parsed: URL;
  try {
    parsed = new URL(rawBaseUrl);
  } catch {
    throw new Error(`Invalid embeddings base URL: ${rawBaseUrl}`);
  }

  if (parsed.protocol !== "https:") {
    throw new Error(`Blocked embeddings base URL protocol (https required): ${parsed.protocol}`);
  }

  if (!isTruthyEnvValue(process.env[allowPrivateHostEnv])) {
    await assertPublicHostname(parsed.hostname, params.lookupFn);
  }

  const isCustomHost = parsed.hostname.toLowerCase() !== fallback.hostname.toLowerCase();
  if (
    params.requireCustomHostOptIn === true &&
    isCustomHost &&
    !isTruthyEnvValue(process.env[allowCustomHostEnv])
  ) {
    throw new Error(
      `Blocked custom embeddings base URL host (${parsed.hostname}). Set ${allowCustomHostEnv}=1 to allow.`,
    );
  }

  return parsed.toString().replace(/\/+$/, "");
}

export function mergeHeadersSafe(params: {
  providerHeaders?: Record<string, string>;
  remoteHeaders?: Record<string, string>;
}): Record<string, string> {
  const merged: Record<string, string> = {};

  const append = (headers?: Record<string, string>) => {
    if (!headers) {
      return;
    }
    for (const [rawName, rawValue] of Object.entries(headers)) {
      const name = rawName.trim();
      if (!name) {
        continue;
      }
      if (PROTECTED_HEADER_NAMES.has(name.toLowerCase())) {
        continue;
      }
      const value = String(rawValue ?? "");
      if (!value) {
        continue;
      }
      merged[name] = value;
    }
  };

  append(params.providerHeaders);
  append(params.remoteHeaders);
  return merged;
}
