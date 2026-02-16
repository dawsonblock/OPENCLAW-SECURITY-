import type { RfsnPolicy } from "../../rfsn/policy.js";
import type { RfsnProvenance } from "../../rfsn/types.js";
import type { AnyAgentTool } from "../pi-tools.types.js";
import { wrapToolsWithRfsnGate } from "../../rfsn/wrap-tools.js";

export function createGatedTools(params: {
  toolsRaw: AnyAgentTool[];
  workspaceDir: string;
  policy: RfsnPolicy;
  meta: {
    actor: string;
    sessionId?: string;
    sessionKey?: string;
    agentId?: string;
    provenance?: RfsnProvenance;
  };
  runtime?: {
    sandboxed?: boolean;
  };
}): AnyAgentTool[] {
  return wrapToolsWithRfsnGate({
    tools: params.toolsRaw,
    workspaceDir: params.workspaceDir,
    policy: params.policy,
    meta: params.meta,
    runtime: params.runtime,
  });
}
