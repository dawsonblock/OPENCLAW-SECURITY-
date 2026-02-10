import { Type } from "@sinclair/typebox";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, test, vi } from "vitest";
import type { AnyAgentTool } from "../agents/pi-tools.types.js";
import { rfsnDispatch } from "./dispatch.js";
import { readLedgerEntries, resolveLedgerFilePath } from "./ledger.js";
import { createDefaultRfsnPolicy } from "./policy.js";

async function createTmpDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "openclaw-rfsn-"));
}

function createTestTool(name: string, executeImpl: AnyAgentTool["execute"]): AnyAgentTool {
  return {
    name,
    label: name,
    description: `${name} tool`,
    parameters: Type.Object({}, { additionalProperties: false }),
    execute: executeImpl,
  };
}

describe("rfsnDispatch", () => {
  test("records proposal/decision/result in the ledger for allowed actions", async () => {
    const workspaceDir = await createTmpDir();
    const execute = vi.fn(async () => ({
      content: [{ type: "text", text: "ok" as const }],
      details: {},
    }));
    const tool = createTestTool("read", execute);
    const policy = createDefaultRfsnPolicy({
      mode: "allowlist",
      allowTools: ["read"],
    });

    await rfsnDispatch({
      tool,
      toolCallId: "call-1",
      args: {},
      workspaceDir,
      policy,
      meta: {
        actor: "embedded-agent",
        sessionId: "session-1",
      },
    });

    expect(execute).toHaveBeenCalledTimes(1);
    const ledgerPath = resolveLedgerFilePath({ workspaceDir, sessionId: "session-1" });
    const entries = await readLedgerEntries(ledgerPath);
    expect(entries).toHaveLength(3);
    expect(entries[0]?.payload.type).toBe("proposal");
    expect(entries[1]?.payload.type).toBe("decision");
    expect(entries[2]?.payload.type).toBe("result");
  });

  test("denied actions do not execute and still write proposal/decision/result", async () => {
    const workspaceDir = await createTmpDir();
    const execute = vi.fn(async () => ({
      content: [{ type: "text", text: "blocked" as const }],
      details: {},
    }));
    const tool = createTestTool("exec", execute);
    const policy = createDefaultRfsnPolicy({
      mode: "allowlist",
      allowTools: ["read"],
    });

    await expect(
      rfsnDispatch({
        tool,
        toolCallId: "call-2",
        args: {},
        workspaceDir,
        policy,
        meta: {
          actor: "embedded-agent",
          sessionId: "session-2",
        },
      }),
    ).rejects.toThrow(/RFSN gate denied tool/);

    expect(execute).not.toHaveBeenCalled();
    const ledgerPath = resolveLedgerFilePath({ workspaceDir, sessionId: "session-2" });
    const entries = await readLedgerEntries(ledgerPath);
    expect(entries).toHaveLength(3);
    expect(entries[0]?.payload.type).toBe("proposal");
    expect(entries[1]?.payload.type).toBe("decision");
    expect(entries[2]?.payload.type).toBe("result");
  });
});
