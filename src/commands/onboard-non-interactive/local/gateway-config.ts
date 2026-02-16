import type { OpenClawConfig } from "../../../config/config.js";
import type { RuntimeEnv } from "../../../runtime.js";
import type { OnboardOptions } from "../../onboard-types.js";

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
  return {
    nextConfig: params.nextConfig,
    port: params.defaultPort,
    gatewayToken: "stub-token",
    bind: "loopback",
    authMode: "token",
    tailscaleMode: "off",
  };
}
