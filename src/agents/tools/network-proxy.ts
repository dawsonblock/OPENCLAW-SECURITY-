import { Type } from "@sinclair/typebox";
import type { OpenClawConfig } from "../../config/config.js";
import { fetchWithSsrFGuard } from "../../infra/net/fetch-guard.js";
import { logWarn } from "../../logger.js";
import {
  NETWORK_DENIED_POLICY,
  validateEgressTarget,
  type ResolvedEgressPolicy,
} from "../../security/network-egress-policy.js";
import { type AnyAgentTool } from "../pi-tools.types.js";
import { jsonResult, readStringParam } from "./common.js";

const NetworkProxySchema = Type.Object({
  url: Type.String({ description: "HTTP or HTTPS URL to fetch." }),
});

const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_BODY_BYTES = 1024 * 1024; // 1MB limit for proxy

function resolveProxyPolicy(config?: OpenClawConfig): ResolvedEgressPolicy {
  const allowlist = config?.security?.network?.allowlist;

  // If no allowlist is configured, deny all.
  if (!allowlist || allowlist.length === 0) {
    if (process.env.OPENCLAW_NETWORK_ALLOW_ALL === "1") {
      logWarn("Network Proxy: OPENCLAW_NETWORK_ALLOW_ALL is set. Allowing all traffic (DEV ONLY).");
      return {
        enabled: true,
        allowDomains: ["*"],
        denyPrivate: true,
        maxBytes: MAX_BODY_BYTES,
        maxSeconds: 10,
      };
    }
    return NETWORK_DENIED_POLICY;
  }

  return {
    enabled: true,
    allowDomains: allowlist,
    denyPrivate: true, // Always deny private ranges for the proxy
    maxBytes: MAX_BODY_BYTES,
    maxSeconds: 10,
  };
}

export function createNetworkProxyTool(options?: { config?: OpenClawConfig }): AnyAgentTool {
  const policy = resolveProxyPolicy(options?.config);

  return {
    name: "network_proxy",
    label: "Network Proxy",
    description:
      "Safely fetch content from allowed external URLs. Restricted by strict security policy.",
    parameters: NetworkProxySchema,
    execute: async (_toolCallId: string, args: unknown) => {
      const params = args as Record<string, unknown>;
      const url = readStringParam(params, "url", { required: true });

      // 1. Validate Target against Policy
      const validation = validateEgressTarget(url, policy);
      if (!validation.ok) {
        throw new Error(`Network Proxy Denied: ${validation.reason}`);
      }

      // 2. Perform Safe Fetch
      try {
        const { response, release } = await fetchWithSsrFGuard({
          url,
          timeoutMs: DEFAULT_TIMEOUT_MS,
          init: {
            headers: {
              "User-Agent": "OpenClaw-NetworkProxy/1.0",
            },
          },
        });

        try {
          if (!response.ok) {
            throw new Error(`HTTP ${response.status} ${response.statusText}`);
          }
          const text = await response.text();
          return jsonResult({
            status: response.status,
            contentType: response.headers.get("content-type"),
            url: response.url,
            length: text.length,
            content: text.slice(0, 50000), // Hard cap return size
          });
        } finally {
          await release();
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new Error(`Network Proxy Failed: ${msg}`, { cause: err });
      }
    },
  };
}
