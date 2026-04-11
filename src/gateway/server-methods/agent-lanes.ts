import type { GatewayRequestHandlers } from "./types.js";
import { loadConfig } from "../../config/config.js";
import { loadCombinedSessionStoreForGateway, listSessionsFromStore } from "../session-utils.js";
import { parseAgentSessionKey, normalizeAgentId } from "../../routing/session-key.js";

/** Operator lanes that get first-class UI treatment. */
const OPERATOR_LANE_IDS = ["triage", "coder", "admin"] as const;
type OperatorLaneId = (typeof OPERATOR_LANE_IDS)[number];

type AgentLaneEntry = {
  agentId: string;
  isOperatorLane: boolean;
  activeSessions: number;
  lastActivity: number | null;
};

type AgentLanesResult = {
  ts: number;
  lanes: AgentLaneEntry[];
};

/**
 * Parse the agentId from a session key in the form `agent:<agentId>:subagent:<uuid>`.
 * Returns null for non-agent session keys.
 */
function parseOperatorAgentId(sessionKey: string): string | null {
  const parsed = parseAgentSessionKey(sessionKey);
  if (!parsed?.agentId) {
    return null;
  }
  return normalizeAgentId(parsed.agentId);
}

export const agentLanesHandlers: GatewayRequestHandlers = {
  "sessions.agentLanes": ({ respond }) => {
    const cfg = loadConfig();
    const { storePath, store } = loadCombinedSessionStoreForGateway(cfg);

    // Pull all sessions (no limit) to aggregate per-agent counts.
    const sessionList = listSessionsFromStore({
      cfg,
      storePath,
      store,
      opts: {},
    });

    const laneMap = new Map<
      string,
      { activeSessions: number; lastActivity: number | null }
    >();

    for (const session of sessionList.sessions) {
      const key = session.key as string | undefined;
      if (typeof key !== "string" || !key) {
        continue;
      }
      const agentId = parseOperatorAgentId(key);
      if (!agentId) {
        continue;
      }

      const updatedAt =
        typeof session.updatedAt === "number" && Number.isFinite(session.updatedAt)
          ? session.updatedAt
          : null;

      const existing = laneMap.get(agentId);
      if (existing) {
        existing.activeSessions += 1;
        if (updatedAt !== null && (existing.lastActivity === null || updatedAt > existing.lastActivity)) {
          existing.lastActivity = updatedAt;
        }
      } else {
        laneMap.set(agentId, { activeSessions: 1, lastActivity: updatedAt });
      }
    }

    // Always include known operator lanes even if they have zero sessions.
    for (const id of OPERATOR_LANE_IDS) {
      if (!laneMap.has(id)) {
        laneMap.set(id, { activeSessions: 0, lastActivity: null });
      }
    }

    const operatorSet = new Set<string>(OPERATOR_LANE_IDS);

    const lanes: AgentLaneEntry[] = Array.from(laneMap.entries())
      .map(([agentId, stats]) => ({
        agentId,
        isOperatorLane: operatorSet.has(agentId),
        activeSessions: stats.activeSessions,
        lastActivity: stats.lastActivity,
      }))
      .sort((a, b) => {
        // Operator lanes first, then by activeSessions desc.
        if (a.isOperatorLane !== b.isOperatorLane) {
          return a.isOperatorLane ? -1 : 1;
        }
        return b.activeSessions - a.activeSessions;
      });

    const result: AgentLanesResult = { ts: Date.now(), lanes };
    respond(true, result, undefined);
  },
};
