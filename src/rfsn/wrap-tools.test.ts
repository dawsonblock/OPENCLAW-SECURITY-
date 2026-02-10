import { Type } from "@sinclair/typebox";
import { describe, expect, test, vi } from "vitest";
import type { AnyAgentTool } from "../agents/pi-tools.types.js";
import { createDefaultRfsnPolicy } from "./policy.js";
import { wrapToolsWithRfsnGate } from "./wrap-tools.js";

function createTool(name: string): AnyAgentTool {
  return {
    name,
    label: name,
    description: `${name} tool`,
    parameters: Type.Object({}, { additionalProperties: false }),
    execute: vi.fn(async () => ({
      content: [{ type: "text", text: "ok" as const }],
      details: {},
    })),
  };
}

describe("wrapToolsWithRfsnGate", () => {
  test("wraps tool execution through the gate and preserves execution", async () => {
    const tool = createTool("read");
    const policy = createDefaultRfsnPolicy({
      mode: "allowlist",
      allowTools: ["read"],
    });

    const [wrapped] = wrapToolsWithRfsnGate({
      tools: [tool],
      workspaceDir: process.cwd(),
      policy,
      meta: { actor: "test" },
    });

    await wrapped.execute("call-1", {}, undefined, undefined);
    expect(tool.execute).toHaveBeenCalledTimes(1);
  });

  test("does not double-wrap tools", async () => {
    const tool = createTool("read");
    const policy = createDefaultRfsnPolicy({
      mode: "allowlist",
      allowTools: ["read"],
    });

    const [firstWrapped] = wrapToolsWithRfsnGate({
      tools: [tool],
      workspaceDir: process.cwd(),
      policy,
      meta: { actor: "test" },
    });
    const [secondWrapped] = wrapToolsWithRfsnGate({
      tools: [firstWrapped],
      workspaceDir: process.cwd(),
      policy,
      meta: { actor: "test" },
    });

    expect(secondWrapped).toBe(firstWrapped);
  });
});
