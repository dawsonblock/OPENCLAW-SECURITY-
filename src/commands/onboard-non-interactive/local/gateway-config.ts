import type { OpenClawConfig } from "../../../config/config.js";
import type { RuntimeEnv } from "../../../runtime.js";
import type { OnboardOptions } from "../../onboard-types.js";
import { buildGatewayAuthConfig } from "../../configure.gateway-auth.js";
import { randomToken, normalizeGatewayTokenInput } from "../../onboard-helpers.js";

export function applyNonInteractiveGatewayConfig(params: {
  nextConfig: OpenClawConfig;
  opts: OnboardOptions;
  runtime: RuntimeEnv;
  defaultPort: number;
}):
  | {
      nextConfig: OpenClawConfig;
      port: number;
      gatewayToken: string;
      bind: string;
      authMode: string;
      tailscaleMode: string;
    }
  | undefined {
  const { opts, nextConfig } = params;

  let port = opts.gatewayPort ?? params.defaultPort;
  let bind = opts.gatewayBind ?? "loopback";
  let authMode = opts.gatewayAuth ?? "token";
  let tailscaleMode = opts.tailscale ?? "off";
  let tailscaleResetOnExit = opts.tailscaleResetOnExit ?? false;

  if (tailscaleMode !== "off" && bind !== "loopback") {
    bind = "loopback";
  }

  if (tailscaleMode === "funnel" && authMode !== "password") {
    authMode = "password";
  }

  let gatewayToken = "";
  let gatewayPassword = "";

  if (authMode === "token") {
    gatewayToken = normalizeGatewayTokenInput(opts.gatewayToken) || randomToken();
  } else if (authMode === "password") {
    if (!opts.gatewayPassword) {
      params.runtime.error(
        "Gateway password is required in non-interactive mode when auth=password.",
      );
      params.runtime.exit(1);
      return undefined;
    }
    gatewayPassword = opts.gatewayPassword?.trim();
  }

  const authConfig = buildGatewayAuthConfig({
    existing: nextConfig.gateway?.auth,
    mode: authMode as "token" | "password",
    token: gatewayToken,
    password: gatewayPassword,
  });

  const next = {
    ...nextConfig,
    gateway: {
      ...nextConfig.gateway,
      mode: "local" as const,
      port,
      bind,
      auth: authConfig,
      tailscale: {
        ...nextConfig.gateway?.tailscale,
        mode: tailscaleMode as "off" | "serve" | "funnel",
        resetOnExit: tailscaleResetOnExit,
      },
    },
  };

  return {
    nextConfig: next,
    port,
    gatewayToken,
    bind,
    authMode,
    tailscaleMode,
  };
}
