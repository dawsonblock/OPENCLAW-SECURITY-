import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { describe, expect, test } from "vitest";
import type { AnyAgentTool } from "../agents/pi-tools.types.js";
import { rfsnDispatch } from "./dispatch.js";
import {
  createGateEventEmissionMiddleware,
  getGateEventEmissionMiddleware,
  setGateEventEmissionMiddleware,
} from "./gate-event-emission.js";
import { createDefaultRfsnPolicy } from "./policy.js";
import { readLedgerEntries, resolveLedgerFilePath } from "./ledger.js";

/**
 * Runtime integration test proving that the dangerous-path RFSN gate is exercised
 * in a real execution flow.
 *
 * This test verifies:
 * 1. A high-risk tool (exec) is blocked when policy denies it
 * 2. A low-risk tool (read) executes successfully when policy allows it
 * 3. The ledger records the proposal/decision/result flow for both paths
 * 4. Missing required capabilities blocks execution even when tool is allowlisted
 *
 * This proves that the runtime actually enforces the gate, not just that
 * the structure claims to.
 */

async function createTmpDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "openclaw-rfsn-integration-"));
}

function createTestTool(name: string, executeImpl: AnyAgentTool["execute"]): AnyAgentTool {
  const { Type } = require("@sinclair/typebox");
  return {
    name,
    label: name,
    description: `${name} tool`,
    parameters: Type.Object({}, { additionalProperties: false }),
    execute: executeImpl,
  };
}

describe("RFSN Runtime Gateway Integration", () => {
  test("dangerous-path: high-risk exec tool is denied when policy forbids it", async () => {
    // This test proves that the live gate rejects exec when it is not allowlisted.
    const workspaceDir = await createTmpDir();
    const execExecuted = { called: false };
    const tool = createTestTool("exec", async () => {
      execExecuted.called = true;
      return {
        content: [{ type: "text", text: "should-not-execute" as const }],
        details: {},
      };
    });

    // Policy explicitly denies exec.
    const policy = createDefaultRfsnPolicy({
      mode: "allowlist",
      allowTools: ["read", "write"],
      useEnvOverrides: false,
    });

    // Attempt to dispatch exec.
    await expect(
      rfsnDispatch({
        tool,
        toolCallId: "call-dangerous-denied",
        args: {},
        workspaceDir,
        policy,
        meta: {
          actor: "embedded-agent",
          sessionId: "session-dangerous-denied",
        },
      }),
    ).rejects.toThrow(/RFSN gate denied tool/);

    // Proof: tool never executed.
    expect(execExecuted.called).toBe(false);

    // Proof: ledger records the denial with all three entries (proposal, decision, result).
    const ledgerPath = resolveLedgerFilePath({
      workspaceDir,
      sessionId: "session-dangerous-denied",
    });
    const entries = await readLedgerEntries(ledgerPath);
    expect(entries.length).toBeGreaterThanOrEqual(3);

    // Verify proposal, decision, and result are all recorded.
    expect(entries.some((e) => e.payload.type === "proposal")).toBe(true);
    expect(entries.some((e) => e.payload.type === "decision")).toBe(true);
    expect(entries.some((e) => e.payload.type === "result")).toBe(true);
  });

  test("dangerous-path: allowed tool executes and ledger records full lifecycle", async () => {
    // This test proves that the live gate allows tools when they are allowlisted.
    const workspaceDir = await createTmpDir();
    const toolExecuted = { called: false };
    const tool = createTestTool("read", async () => {
      toolExecuted.called = true;
      return {
        content: [{ type: "text", text: "executed" as const }],
        details: {},
      };
    });

    // Policy allows read.
    const policy = createDefaultRfsnPolicy({
      mode: "allowlist",
      allowTools: ["read"],
      grantedCapabilities: ["fs:read:workspace"],
      useEnvOverrides: false,
    });

    // Dispatch read.
    const result = await rfsnDispatch({
      tool,
      toolCallId: "call-allowed",
      args: {},
      workspaceDir,
      policy,
      meta: {
        actor: "embedded-agent",
        sessionId: "session-allowed",
      },
    });

    // Proof: tool executed and returned result.
    expect(toolExecuted.called).toBe(true);
    expect(result.content).toHaveLength(1);
    if (result.content[0]) {
      expect(result.content[0].text).toBe("executed");
    }

    // Proof: ledger records the full lifecycle.
    const ledgerPath = resolveLedgerFilePath({
      workspaceDir,
      sessionId: "session-allowed",
    });
    const entries = await readLedgerEntries(ledgerPath);
    expect(entries.length).toBeGreaterThanOrEqual(3);

    // Verify all three entry types exist.
    expect(entries.some((e) => e.payload.type === "proposal")).toBe(true);
    expect(entries.some((e) => e.payload.type === "decision")).toBe(true);
    expect(entries.some((e) => e.payload.type === "result")).toBe(true);
  });

  test("dangerous-path: missing proc:manage capability blocks exec even if allowlisted", async () => {
    // This test proves that the gate checks not just tool allowlist, but also
    // required capabilities. Even when exec is allowed, missing proc:manage denies it.
    const workspaceDir = await createTmpDir();
    const execExecuted = { called: false };
    const tool = createTestTool("exec", async () => {
      execExecuted.called = true;
      return {
        content: [{ type: "text", text: "should-not-execute" as const }],
        details: {},
      };
    });

    // Policy allows exec but does not grant proc:manage capability.
    const policy = createDefaultRfsnPolicy({
      mode: "allowlist",
      allowTools: ["exec"],
      grantedCapabilities: ["fs:read:workspace", "fs:write:workspace"],
      useEnvOverrides: false,
    });

    // Dispatch exec.
    await expect(
      rfsnDispatch({
        tool,
        toolCallId: "call-dangerous-cap-missing",
        args: {},
        workspaceDir,
        policy,
        meta: {
          actor: "embedded-agent",
          sessionId: "session-dangerous-cap-missing",
        },
      }),
    ).rejects.toThrow(/RFSN gate denied tool|required capability/i);

    // Proof: tool never executed.
    expect(execExecuted.called).toBe(false);

    // Proof: ledger records the denial.
    const ledgerPath = resolveLedgerFilePath({
      workspaceDir,
      sessionId: "session-dangerous-cap-missing",
    });
    const entries = await readLedgerEntries(ledgerPath);
    expect(entries.length).toBeGreaterThanOrEqual(1);
    expect(entries.some((e) => e.payload.type === "decision")).toBe(true);
  });

  test("dangerous-path: runtime gate emits allow and deny events on the live dispatch path", async () => {
    const workspaceDir = await createTmpDir();
    const captured: Array<{
      verdict: "allow" | "deny" | "error";
      toolName: string;
      reason?: string;
    }> = [];
    const previousMiddleware = getGateEventEmissionMiddleware();
    setGateEventEmissionMiddleware(
      createGateEventEmissionMiddleware((event) => {
        captured.push(event);
      }),
    );

    try {
      const execTool = createTestTool("exec", async () => ({
        content: [{ type: "text", text: "executed" as const }],
        details: {},
      }));

      await expect(
        rfsnDispatch({
          tool: execTool,
          toolCallId: "call-dangerous-denied-event",
          args: {},
          workspaceDir,
          policy: createDefaultRfsnPolicy({
            mode: "allowlist",
            allowTools: ["read"],
            useEnvOverrides: false,
          }),
          meta: {
            actor: "embedded-agent",
            sessionId: "session-dangerous-denied-event",
          },
        }),
      ).rejects.toThrow(/RFSN gate denied tool/);

      await rfsnDispatch({
        tool: execTool,
        toolCallId: "call-dangerous-allowed-event",
        args: { command: "echo runtime-proof" },
        workspaceDir,
        policy: createDefaultRfsnPolicy({
          mode: "allowlist",
          allowTools: ["exec"],
          grantedCapabilities: ["proc:manage"],
          useEnvOverrides: false,
        }),
        meta: {
          actor: "embedded-agent",
          sessionId: "session-dangerous-allowed-event",
        },
        runtime: {
          sandboxed: true,
        },
      });

      expect(
        captured.some((event) => event.toolName === "exec" && event.verdict === "deny"),
      ).toBe(true);
      expect(
        captured.some((event) => event.toolName === "exec" && event.verdict === "allow"),
      ).toBe(true);
    } finally {
      setGateEventEmissionMiddleware(previousMiddleware);
    }
  });
});
