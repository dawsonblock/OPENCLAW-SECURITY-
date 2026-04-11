import { describe, expect, it, vi } from "vitest";

vi.mock("../../config/config.js", () => ({
  loadConfig: vi.fn(() => ({
    agents: { list: [{ id: "triage" }, { id: "coder" }, { id: "admin" }, { id: "main" }] },
    session: {},
  })),
}));

vi.mock("../session-utils.js", () => ({
  loadCombinedSessionStoreForGateway: vi.fn(() => ({
    storePath: "(test)",
    store: {},
  })),
  listSessionsFromStore: vi.fn(({ store }: { store: Record<string, unknown> }) => {
    // Return whatever sessions are in the mock store.
    return {
      ts: Date.now(),
      path: "(test)",
      count: Object.keys(store).length,
      sessions: Object.entries(store).map(([key, entry]) => ({
        key,
        updatedAt: (entry as { updatedAt?: number }).updatedAt ?? null,
      })),
    };
  }),
}));

import { loadCombinedSessionStoreForGateway } from "../session-utils.js";
import { agentLanesHandlers } from "./agent-lanes.js";

const vi_mockedStore = vi.mocked(loadCombinedSessionStoreForGateway);

function makeRespond() {
  return vi.fn() as ReturnType<typeof vi.fn>;
}

describe("sessions.agentLanes", () => {
  it("returns all three operator lanes even with no sessions", () => {
    const respond = makeRespond();
    agentLanesHandlers["sessions.agentLanes"]({
      respond,
      params: {},
    } as never);

    expect(respond).toHaveBeenCalledTimes(1);
    const [ok, result] = respond.mock.calls[0] as [boolean, { lanes: Array<{ agentId: string; activeSessions: number; isOperatorLane: boolean }> }];
    expect(ok).toBe(true);
    const laneIds = result.lanes.map((l) => l.agentId);
    expect(laneIds).toContain("triage");
    expect(laneIds).toContain("coder");
    expect(laneIds).toContain("admin");
  });

  it("counts subagent sessions grouped by operator lane", () => {
    vi_mockedStore.mockReturnValueOnce({
      storePath: "(test)",
      store: {
        "agent:triage:subagent:uuid-1": { updatedAt: 1000 },
        "agent:triage:subagent:uuid-2": { updatedAt: 2000 },
        "agent:coder:subagent:uuid-3": { updatedAt: 3000 },
        "main": { updatedAt: 500 },
      } as never,
    });

    const respond = makeRespond();
    agentLanesHandlers["sessions.agentLanes"]({
      respond,
      params: {},
    } as never);

    const [ok, result] = respond.mock.calls[0] as [boolean, { lanes: Array<{ agentId: string; activeSessions: number; lastActivity: number | null }> }];
    expect(ok).toBe(true);

    const triagedLane = result.lanes.find((l) => l.agentId === "triage");
    expect(triagedLane?.activeSessions).toBe(2);
    expect(triagedLane?.lastActivity).toBe(2000);

    const coderLane = result.lanes.find((l) => l.agentId === "coder");
    expect(coderLane?.activeSessions).toBe(1);

    const adminLane = result.lanes.find((l) => l.agentId === "admin");
    expect(adminLane?.activeSessions).toBe(0);
  });

  it("marks operator lanes as isOperatorLane=true", () => {
    const respond = makeRespond();
    agentLanesHandlers["sessions.agentLanes"]({
      respond,
      params: {},
    } as never);

    const [, result] = respond.mock.calls[0] as [boolean, { lanes: Array<{ agentId: string; isOperatorLane: boolean }> }];
    for (const lane of result.lanes) {
      const expected = ["triage", "coder", "admin"].includes(lane.agentId);
      expect(lane.isOperatorLane).toBe(expected);
    }
  });

  it("operator lanes appear first in sorted result", () => {
    vi_mockedStore.mockReturnValueOnce({
      storePath: "(test)",
      store: {
        "agent:triage:subagent:uuid-x": { updatedAt: 100 },
      } as never,
    });

    const respond = makeRespond();
    agentLanesHandlers["sessions.agentLanes"]({
      respond,
      params: {},
    } as never);

    const [, result] = respond.mock.calls[0] as [boolean, { lanes: Array<{ agentId: string; isOperatorLane: boolean }> }];
    const firstNonOperator = result.lanes.findIndex((l) => !l.isOperatorLane);
    const lastOperator = result.lanes.map((l) => l.isOperatorLane).lastIndexOf(true);
    // All operator lanes should precede any non-operator lane.
    if (firstNonOperator !== -1 && lastOperator !== -1) {
      expect(lastOperator).toBeLessThan(firstNonOperator);
    }
  });
});
