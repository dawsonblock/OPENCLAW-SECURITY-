import type { OpenClawConfig } from "../config/config.js";
import type { GatewayBindMode } from "../config/types.gateway.js";
import { isLoopbackHost } from "../gateway/net.js";
import { DEFAULT_DANGEROUS_NODE_COMMANDS } from "../gateway/node-command-policy.js";

function truthyEnv(value: string | undefined): boolean {
  const normalized = value?.trim().toLowerCase();
  return normalized === "1" || normalized === "true";
}

export function isSafeModeEnabled(env: NodeJS.ProcessEnv): boolean {
  return truthyEnv(env.OPENCLAW_SAFE_MODE);
}

export function allowUnsafeGatewayConfig(env: NodeJS.ProcessEnv): boolean {
  return truthyEnv(env.OPENCLAW_ALLOW_UNSAFE_CONFIG);
}

export function isSafeExposure(bindHost: string, tailscaleMode: string): boolean {
  return isLoopbackHost(bindHost) || tailscaleMode === "serve";
}

function listConfiguredDangerousCommands(cfg: OpenClawConfig): string[] {
  const allowCommands = cfg.gateway?.nodes?.allowCommands ?? [];
  return allowCommands.filter((cmd) => DEFAULT_DANGEROUS_NODE_COMMANDS.includes(cmd));
}

export function resolveStartupBindOverride(params: {
  bind?: GatewayBindMode;
  host?: string;
  env: NodeJS.ProcessEnv;
}): { bind?: GatewayBindMode; host?: string } {
  if (!isSafeModeEnabled(params.env)) {
    return {
      bind: params.bind,
      host: params.host,
    };
  }
  return {
    bind: "loopback",
    host: undefined,
  };
}

export function validateGatewayStartupSecurity(params: {
  cfg: OpenClawConfig;
  bindHost: string;
  tailscaleMode: string;
  env: NodeJS.ProcessEnv;
}): string[] {
  const issues: string[] = [];
  const safeExposure = isSafeExposure(params.bindHost, params.tailscaleMode);
  if (safeExposure) {
    return issues;
  }

  const dangerousCommands = listConfiguredDangerousCommands(params.cfg);
  if (dangerousCommands.length > 0) {
    issues.push(
      `dangerous node commands enabled (${dangerousCommands.join(", ")}) on exposed gateway`,
    );
  }

  if (params.cfg.gateway?.controlUi?.allowInsecureAuth === true) {
    issues.push("gateway.controlUi.allowInsecureAuth=true on exposed gateway");
  }

  if (params.cfg.gateway?.controlUi?.dangerouslyDisableDeviceAuth === true) {
    issues.push("gateway.controlUi.dangerouslyDisableDeviceAuth=true on exposed gateway");
  }

  if (truthyEnv(params.env.OPENCLAW_ALLOW_NODE_EXEC)) {
    issues.push("OPENCLAW_ALLOW_NODE_EXEC=1 on exposed gateway");
  }

  if (truthyEnv(params.env.OPENCLAW_ALLOW_HOST_EXEC)) {
    issues.push("OPENCLAW_ALLOW_HOST_EXEC=1 on exposed gateway");
  }

  if (truthyEnv(params.env.OPENCLAW_ALLOW_BROWSER_PROXY)) {
    issues.push("OPENCLAW_ALLOW_BROWSER_PROXY=1 on exposed gateway");
  }

  return issues;
}
