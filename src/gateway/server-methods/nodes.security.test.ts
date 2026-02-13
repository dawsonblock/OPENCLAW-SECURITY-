import { describe, expect, it, vi } from "vitest";
import { nodeHandlers } from "./nodes.js";

type InvokeRes = {
  ok: boolean;
  payload?: unknown;
  error?: { code?: string; message?: string };
};

async function invokeNode(
  params: Record<string, unknown>,
  client: { connect?: { role?: string; scopes?: string[] } } | null,
): Promise<InvokeRes> {
  const respond = vi.fn<
    [
      ok: boolean,
      payload?: unknown,
      error?: { code?: string; message?: string },
      meta?: Record<string, unknown>,
    ],
    void
  >();
  await nodeHandlers["node.invoke"]({
    req: { type: "req", id: "req-1", method: "node.invoke", params } as never,
    params,
    client: client as never,
    isWebchatConnect: () => false,
    respond,
    context: {
      nodeRegistry: {} as never,
      execApprovalManager: {
        computeBindHash: () => "hash",
        consumeToken: () => false,
      },
    } as never,
  });

  const [ok, payload, error] = respond.mock.calls[0] ?? [];
  return { ok: Boolean(ok), payload, error };
}

describe("node.invoke security checks", () => {
  it("requires operator.admin for system.execApprovals.get", async () => {
    const res = await invokeNode(
      {
        nodeId: "node-1",
        command: "system.execApprovals.get",
        params: {},
        idempotencyKey: "k-1",
      },
      { connect: { role: "operator", scopes: ["operator.write"] } },
    );

    expect(res.ok).toBe(false);
    expect(res.error?.message).toContain("missing scope: operator.admin");
  });

  it("blocks browser.proxy unless break-glass env is enabled", async () => {
    const previous = process.env.OPENCLAW_ALLOW_BROWSER_PROXY;
    delete process.env.OPENCLAW_ALLOW_BROWSER_PROXY;

    try {
      const res = await invokeNode(
        {
          nodeId: "node-1",
          command: "browser.proxy",
          params: {},
          idempotencyKey: "k-2",
        },
        { connect: { role: "operator", scopes: ["operator.admin"] } },
      );
      expect(res.ok).toBe(false);
      expect(res.error?.message).toContain("OPENCLAW_ALLOW_BROWSER_PROXY=1");
    } finally {
      if (previous === undefined) {
        delete process.env.OPENCLAW_ALLOW_BROWSER_PROXY;
      } else {
        process.env.OPENCLAW_ALLOW_BROWSER_PROXY = previous;
      }
    }
  });

  it("requires operator.admin for browser.proxy", async () => {
    const previous = process.env.OPENCLAW_ALLOW_BROWSER_PROXY;
    process.env.OPENCLAW_ALLOW_BROWSER_PROXY = "1";
    try {
      const res = await invokeNode(
        {
          nodeId: "node-1",
          command: "browser.proxy",
          params: {},
          idempotencyKey: "k-3",
        },
        { connect: { role: "operator", scopes: ["operator.write"] } },
      );
      expect(res.ok).toBe(false);
      expect(res.error?.message).toContain("missing scope: operator.admin");
    } finally {
      if (previous === undefined) {
        delete process.env.OPENCLAW_ALLOW_BROWSER_PROXY;
      } else {
        process.env.OPENCLAW_ALLOW_BROWSER_PROXY = previous;
      }
    }
  });

  it("blocks system.run deny-pattern commands", async () => {
    const res = await invokeNode(
      {
        nodeId: "node-1",
        command: "system.run",
        params: {
          command: ["bash", "-c", "echo risky"],
        },
        idempotencyKey: "k-4",
      },
      { connect: { role: "operator", scopes: ["operator.admin"] } },
    );
    expect(res.ok).toBe(false);
    expect(res.error?.message).toContain("shell -c execution is not allowed");
  });
});
