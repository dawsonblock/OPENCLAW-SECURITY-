import type { OpenClawConfig } from "../config/config.js";
import type { NodeInvokeResult, NodeRegistry, NodeSession } from "./node-registry.js";
import { isNodeCommandAllowed, resolveNodeCommandAllowlist } from "./node-command-policy.js";

type NodeRegistryLike = Pick<NodeRegistry, "get" | "invoke">;

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
