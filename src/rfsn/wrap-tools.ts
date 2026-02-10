import type { AgentToolUpdateCallback } from "@mariozechner/pi-agent-core";
import type { AnyAgentTool } from "../agents/pi-tools.types.js";
import type { RfsnPolicy } from "./policy.js";
import type { RfsnProvenance } from "./types.js";
import { rfsnDispatch } from "./dispatch.js";

const RFSN_WRAPPED_SYMBOL = Symbol.for("openclaw.rfsn.wrapped");

type WrappedTool = AnyAgentTool & {
  [RFSN_WRAPPED_SYMBOL]?: boolean;
};

export function wrapToolsWithRfsnGate(params: {
  tools: AnyAgentTool[];
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
  return params.tools.map((tool) => {
    const existing = tool as WrappedTool;
    if (existing[RFSN_WRAPPED_SYMBOL]) {
      return tool;
    }

    const wrapped: WrappedTool = {
      ...tool,
      execute: async (
        toolCallId: string,
        args: unknown,
        signal?: AbortSignal,
        onUpdate?: AgentToolUpdateCallback<unknown>,
      ) => {
        return rfsnDispatch({
          tool,
          toolCallId,
          args,
          signal,
          onUpdate,
          workspaceDir: params.workspaceDir,
          policy: params.policy,
          meta: params.meta,
          runtime: params.runtime,
        });
      },
    };

    wrapped[RFSN_WRAPPED_SYMBOL] = true;
    return wrapped;
  });
}
