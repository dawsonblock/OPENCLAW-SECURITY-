import type { OpenClawConfig } from "../config/config.js";
import type { NodeInvokeResult, NodeRegistry, NodeSession } from "./node-registry.js";
import { isSafeModeEnabled } from "../security/startup-validator.js";
import {
  DEFAULT_DANGEROUS_NODE_COMMANDS,
  isNodeCommandAllowed,
  resolveNodeCommandAllowlist,
} from "./node-command-policy.js";

type NodeRegistryLike = Pick<NodeRegistry, "get" | "invoke">;

function dangerousExposureOverrideEnabled(): boolean {
  const value = process.env.OPENCLAW_ALLOW_DANGEROUS_EXPOSED?.trim().toLowerCase();
  return value === "1" || value === "true";
}

function isSafeExposure(cfg: OpenClawConfig): boolean {
  const bind = String(cfg.gateway?.bind ?? "loopback")
    .trim()
    .toLowerCase();
  if (bind === "loopback") {
    return true;
  }
  const tailscaleMode = String(cfg.gateway?.tailscale?.mode ?? "off")
    .trim()
    .toLowerCase();
  return tailscaleMode === "serve";
}

export type NodeCommandKernelGateResult =
  | {
      ok: true;
      node: NodeSession;
      result: NodeInvokeResult;
    }
  | {
      ok: false;
      code: "NOT_CONNECTED" | "NOT_ALLOWED";
      message: string;
      details?: Record<string, unknown>;
    };

export async function invokeNodeCommandWithKernelGate(params: {
  cfg: OpenClawConfig;
  nodeRegistry: NodeRegistryLike;
  nodeId: string;
  command: string;
  commandParams?: unknown;
  timeoutMs?: number;
  idempotencyKey?: string;
}): Promise<NodeCommandKernelGateResult> {
  const nodeId = params.nodeId.trim();
  const command = params.command.trim();
  const node = params.nodeRegistry.get(nodeId);
  if (!node) {
    return {
      ok: false,
      code: "NOT_CONNECTED",
      message: "node not connected",
      details: { code: "NOT_CONNECTED" },
    };
  }

  const allowlist = resolveNodeCommandAllowlist(params.cfg, node);
  const allowed = isNodeCommandAllowed({
    command,
    declaredCommands: node.commands,
    allowlist,
  });
  if (!allowed.ok) {
    return {
      ok: false,
      code: "NOT_ALLOWED",
      message: `node command not allowed: ${allowed.reason}`,
      details: {
        reason: allowed.reason,
        command,
      },
    };
  }

  const dangerous = DEFAULT_DANGEROUS_NODE_COMMANDS.includes(command);
  if (dangerous && isSafeModeEnabled(process.env)) {
    return {
      ok: false,
      code: "NOT_ALLOWED",
      message: "node command not allowed: OPENCLAW_SAFE_MODE=1 disables dangerous node commands",
      details: {
        reason: "dangerous command blocked by safe mode",
        command,
      },
    };
  }
  if (dangerous && !isSafeExposure(params.cfg) && !dangerousExposureOverrideEnabled()) {
    return {
      ok: false,
      code: "NOT_ALLOWED",
      message:
        "node command not allowed: dangerous node commands require loopback exposure or gateway.tailscale.mode=serve (set OPENCLAW_ALLOW_DANGEROUS_EXPOSED=1 for break-glass)",
      details: {
        reason: "dangerous command blocked on exposed gateway",
        command,
      },
    };
  }

  const result = await params.nodeRegistry.invoke({
    nodeId,
    command,
    params: params.commandParams,
    timeoutMs: params.timeoutMs,
    idempotencyKey: params.idempotencyKey,
  });

  return {
    ok: true,
    node,
    result,
  };
}
