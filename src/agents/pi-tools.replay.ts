import crypto from "node:crypto";
import type { RfsnActionProposal, RfsnActionResult, RfsnLedgerEntry } from "../rfsn/types.js";
import { createSubsystemLogger } from "../logging/subsystem.js";
import { appendLedgerEntry, readLedgerEntries, resolveLedgerFilePath } from "../rfsn/ledger.js";
import { type AnyAgentTool, type AgentToolResult } from "./pi-tools.types.js";

const log = createSubsystemLogger("agents/replay");

function isReplayMode(): boolean {
  return process.env.OPENCLAW_REPLAY_MODE === "1";
}

// Simple in-memory cache for replay entries to avoid re-reading ledger on every tool call
// Key: ledgerPath, Value: RfsnLedgerEntry[] without wrapper
const replayCache = new Map<string, RfsnLedgerEntry[]>();

async function getReplayEntries(
  workspaceDir: string,
  sessionKey?: string,
): Promise<RfsnLedgerEntry[]> {
  const ledgerPath = resolveLedgerFilePath({ workspaceDir, sessionKey });
  if (replayCache.has(ledgerPath)) {
    return replayCache.get(ledgerPath)!;
  }

  try {
    const entries = await readLedgerEntries(ledgerPath);
    const unwrapped = entries.map((e) => e.payload);
    replayCache.set(ledgerPath, unwrapped);
    return unwrapped;
  } catch (err) {
    log.warn(`Replay: Failed to read ledger at ${ledgerPath}: ${String(err)}`);
    return [];
  }
}

// Stateful replay tracking
// We need to track which entries have been consumed to support multiple calls to same tool

const CONSUMED = Symbol("consumed");

function findMatchingReplayEntry(
  entries: (RfsnLedgerEntry & { [CONSUMED]?: boolean })[],
  toolName: string,
  args: unknown,
): RfsnActionResult | undefined {
  const canonicalArgs = JSON.stringify(args);

  // Find first unconsumed PROPOSAL matching tool/args
  const proposalEntry = entries.find(
    (e) =>
      e.type === "proposal" &&
      e.proposal.toolName === toolName &&
      JSON.stringify(e.proposal.args) === canonicalArgs &&
      !e[CONSUMED],
  );

  if (!proposalEntry || proposalEntry.type !== "proposal") {
    return undefined;
  }

  // Find corresponding RESULT
  // In a sequential ledger, the result should be AFTER the proposal.
  // We search from proposal index onwards.
  const proposalIndex = entries.indexOf(proposalEntry);
  const resultEntry = entries
    .slice(proposalIndex + 1)
    .find((e) => e.type === "result" && e.proposalId === proposalEntry.proposal.id);

  if (resultEntry && resultEntry.type === "result") {
    proposalEntry[CONSUMED] = true;
    return resultEntry.result;
  }

  return undefined;
}

export function wrapToolWithReplay(
  tool: AnyAgentTool,
  context: {
    workspaceDir: string;
    sessionKey?: string;
    agentId?: string;
  },
): AnyAgentTool {
  return {
    ...tool,
    execute: async (toolCallId, args, signal, onUpdate) => {
      const timestampMs = Date.now();
      const proposalId = crypto.randomUUID();

      // 1. REPLAY MODE CHECK
      if (isReplayMode()) {
        const entries = await getReplayEntries(context.workspaceDir, context.sessionKey);
        const match = findMatchingReplayEntry(entries, tool.name, args);

        if (match) {
          log.info(`Replay: Hit for tool ${tool.name}`);
          return match.output as AgentToolResult;
        } else {
          log.warn(
            `Replay: No match found for tool ${tool.name}. Falling through to live execution.`,
          );
        }
      }

      // 2. RECORD PROPOSAL
      const proposal: RfsnActionProposal = {
        id: proposalId,
        timestampMs,
        actor: context.agentId ?? "unknown",
        sessionKey: context.sessionKey,
        toolName: tool.name,
        args,
      };

      if (!isReplayMode()) {
        try {
          await appendLedgerEntry({
            workspaceDir: context.workspaceDir,
            sessionKey: context.sessionKey,
            entry: {
              type: "proposal",
              timestampMs,
              proposal,
            },
          });
        } catch (e) {
          log.warn(`Ledger: Failed to record proposal: ${String(e)}`);
        }
      }

      // 3. EXECUTE REAL TOOL
      const start = Date.now();
      let result: AgentToolResult;
      let status: "ok" | "error" = "ok";
      let errorInfo: { name: string; message: string } | undefined;

      try {
        result = await tool.execute(toolCallId, args, signal, onUpdate);
      } catch (err) {
        status = "error";
        errorInfo = {
          name: (err as Error).name,
          message: (err as Error).message,
        };
        throw err;
      } finally {
        if (!isReplayMode()) {
          const durationMs = Date.now() - start;

          try {
            if (status === "ok") {
              const resultEntry: RfsnActionResult = {
                status: "ok",
                toolName: tool.name,
                durationMs,
                output: result!,
              };
              await appendLedgerEntry({
                workspaceDir: context.workspaceDir,
                sessionKey: context.sessionKey,
                entry: {
                  type: "result",
                  timestampMs: Date.now(),
                  proposalId,
                  result: resultEntry,
                },
              });
            } else {
              // Record error
              await appendLedgerEntry({
                workspaceDir: context.workspaceDir,
                sessionKey: context.sessionKey,
                entry: {
                  type: "error",
                  timestampMs: Date.now(),
                  proposalId,
                  error: errorInfo!,
                },
              });
            }
          } catch (e) {
            log.warn(`Ledger: Failed to record result: ${String(e)}`);
          }
        }
      }

      return result;
    },
  };
}
