import type { AgentToolUpdateCallback } from "@mariozechner/pi-agent-core";
import { randomUUID } from "node:crypto";
import type { AnyAgentTool } from "../agents/pi-tools.types.js";
import type { RfsnPolicy } from "./policy.js";
import type { RfsnActionProposal, RfsnActionResult, RfsnProvenance } from "./types.js";
import { getGateFeedbackTracker, isAdaptiveRiskEnabled } from "./gate-feedback.js";
import { evaluateGate, hasValidGateStamp } from "./gate.js";
import { appendLedgerEntry } from "./ledger.js";

// Inline symbol check — avoids circular dep with wrap-tools.ts (which imports rfsnDispatch).
const RFSN_WRAPPED_KEY = Symbol.for("openclaw.rfsn.wrapped");
function isToolAlreadyWrapped(tool: AnyAgentTool): boolean {
  return Boolean((tool as unknown as Record<symbol, unknown>)[RFSN_WRAPPED_KEY]);
}

function summarizeToolResult(result: unknown): string | undefined {
  if (!result || typeof result !== "object") {
    return undefined;
  }
  const record = result as { content?: unknown };
  if (!Array.isArray(record.content) || record.content.length === 0) {
    return undefined;
  }
  const first = record.content[0];
  if (!first || typeof first !== "object") {
    return undefined;
  }
  const text = (first as { text?: unknown }).text;
  if (typeof text !== "string") {
    return undefined;
  }
  return text.slice(0, 280);
}

function buildProposal(params: {
  tool: AnyAgentTool;
  args: unknown;
  meta: {
    actor: string;
    sessionId?: string;
    sessionKey?: string;
    agentId?: string;
    provenance?: RfsnProvenance;
  };
}): RfsnActionProposal {
  return {
    id: randomUUID(),
    timestampMs: Date.now(),
    actor: params.meta.actor,
    sessionId: params.meta.sessionId,
    sessionKey: params.meta.sessionKey,
    agentId: params.meta.agentId,
    toolName: params.tool.name,
    args: params.args,
    provenance: params.meta.provenance,
  };
}

export async function rfsnDispatch(params: {
  tool: AnyAgentTool;
  toolCallId: string;
  args: unknown;
  signal?: AbortSignal;
  onUpdate?: AgentToolUpdateCallback<unknown>;
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
}): Promise<Awaited<ReturnType<AnyAgentTool["execute"]>>> {
  const captureToolOutput = process.env.OPENCLAW_RFSN_LEDGER_CAPTURE_OUTPUT === "1";

  // Guard: reject double-wrapped tools to prevent infinite recursion
  if (isToolAlreadyWrapped(params.tool)) {
    throw new Error(
      `RFSN dispatch integrity violation: tool "${params.tool.name}" is already kernel-wrapped. ` +
        "Double-gating is not allowed — ensure rfsnDispatch receives the raw tool.",
    );
  }

  const proposal = buildProposal({ tool: params.tool, args: params.args, meta: params.meta });

  await appendLedgerEntry({
    workspaceDir: params.workspaceDir,
    sessionId: params.meta.sessionId,
    sessionKey: params.meta.sessionKey,
    entry: {
      type: "proposal",
      timestampMs: Date.now(),
      proposal,
    },
  });

  const decision = evaluateGate({
    policy: params.policy,
    proposal,
    sandboxed: params.runtime?.sandboxed,
  });

  // Verify the decision was produced by evaluateGate (not forged)
  if (!hasValidGateStamp(decision)) {
    throw new Error(
      `RFSN gate integrity violation: decision for "${proposal.toolName}" lacks valid gate stamp. ` +
        "Gate decisions must originate from evaluateGate.",
    );
  }

  await appendLedgerEntry({
    workspaceDir: params.workspaceDir,
    sessionId: params.meta.sessionId,
    sessionKey: params.meta.sessionKey,
    entry: {
      type: "decision",
      timestampMs: Date.now(),
      proposalId: proposal.id,
      decision,
    },
  });

  if (decision.verdict !== "allow") {
    const deniedResult: RfsnActionResult = {
      status: "error",
      toolName: proposal.toolName,
      summary: decision.reasons.join(","),
      durationMs: 0,
    };
    await appendLedgerEntry({
      workspaceDir: params.workspaceDir,
      sessionId: params.meta.sessionId,
      sessionKey: params.meta.sessionKey,
      entry: {
        type: "result",
        timestampMs: Date.now(),
        proposalId: proposal.id,
        result: deniedResult,
      },
    });
    throw new Error(
      `RFSN gate denied tool "${proposal.toolName}" (${decision.verdict}): ${decision.reasons.join(", ")}`,
    );
  }

  const startedAt = Date.now();
  // Freeze normalizedArgs to prevent post-gate mutation
  const frozenArgs =
    decision.normalizedArgs != null && typeof decision.normalizedArgs === "object"
      ? Object.freeze(decision.normalizedArgs)
      : decision.normalizedArgs;
  try {
    const output = await params.tool.execute(
      params.toolCallId,
      frozenArgs,
      params.signal,
      params.onUpdate,
    );
    const summary = captureToolOutput ? summarizeToolResult(output) : undefined;
    const resultEntry: RfsnActionResult = {
      status: "ok",
      toolName: proposal.toolName,
      summary: summary ?? (captureToolOutput ? "ok" : "omitted"),
      durationMs: Math.max(0, Date.now() - startedAt),
    };
    await appendLedgerEntry({
      workspaceDir: params.workspaceDir,
      sessionId: params.meta.sessionId,
      sessionKey: params.meta.sessionKey,
      entry: {
        type: "result",
        timestampMs: Date.now(),
        proposalId: proposal.id,
        result: resultEntry,
      },
    });
    if (isAdaptiveRiskEnabled()) {
      getGateFeedbackTracker().recordOutcome(proposal.toolName, "success");
    }
    return output;
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    await appendLedgerEntry({
      workspaceDir: params.workspaceDir,
      sessionId: params.meta.sessionId,
      sessionKey: params.meta.sessionKey,
      entry: {
        type: "error",
        timestampMs: Date.now(),
        proposalId: proposal.id,
        error: {
          name: err.name,
          message: err.message,
        },
      },
    });
    if (isAdaptiveRiskEnabled()) {
      getGateFeedbackTracker().recordOutcome(proposal.toolName, "error");
    }
    throw err;
  }
}
