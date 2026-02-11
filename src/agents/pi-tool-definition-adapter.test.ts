import type { AgentTool } from "@mariozechner/pi-agent-core";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createDefaultRfsnPolicy } from "../rfsn/policy.js";
import { wrapToolsWithRfsnGate } from "../rfsn/wrap-tools.js";
import { toToolDefinitions } from "./pi-tool-definition-adapter.js";

async function wrapToolWithRfsn(
  tool: AgentTool<unknown, unknown>,
): Promise<AgentTool<unknown, unknown>> {
  const workspaceDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-rfsn-adapter-"));
  const policy = createDefaultRfsnPolicy({
    mode: "allowlist",
    allowTools: [tool.name],
  });
  const [wrapped] = wrapToolsWithRfsnGate({
    tools: [tool],
    workspaceDir,
    policy,
    meta: {
      actor: "test",
    },
  });
  return wrapped;
}

describe("pi tool definition adapter", () => {
  it("rejects unwrapped tools", () => {
    const tool = {
      name: "raw",
      label: "Raw",
      description: "raw",
      parameters: {},
      execute: async () => ({
        content: [{ type: "text" as const, text: "ok" }],
        details: {},
      }),
    } satisfies AgentTool<unknown, unknown>;

    expect(() => toToolDefinitions([tool])).toThrow(/RFSN final authority violation/);
  });

  it("wraps tool errors into a tool result", async () => {
    const tool = {
      name: "boom",
      label: "Boom",
      description: "throws",
      parameters: {},
      execute: async () => {
        throw new Error("nope");
      },
    } satisfies AgentTool<unknown, unknown>;

    const defs = toToolDefinitions([await wrapToolWithRfsn(tool)]);
    const result = await defs[0].execute("call1", {}, undefined, undefined);

    expect(result.details).toMatchObject({
      status: "error",
      tool: "boom",
    });
    expect(result.details).toMatchObject({ error: "nope" });
    expect(JSON.stringify(result.details)).not.toContain("\n    at ");
  });

  it("normalizes exec tool aliases in error results", async () => {
    const tool = {
      name: "bash",
      label: "Bash",
      description: "throws",
      parameters: {},
      execute: async () => {
        throw new Error("nope");
      },
    } satisfies AgentTool<unknown, unknown>;

    const defs = toToolDefinitions([await wrapToolWithRfsn(tool)]);
    const result = await defs[0].execute("call2", {}, undefined, undefined);

    expect(result.details).toMatchObject({
      status: "error",
      tool: "exec",
      error: "nope",
    });
  });
});
