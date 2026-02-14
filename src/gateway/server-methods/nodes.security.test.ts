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
      nodeRegistry: {
        get: () => undefined,
        invoke: vi.fn(),
      } as never,
      dedupe: new Map(),
      cronStorePath: "/tmp/openclaw-cron.json",
      logGateway: {
        warn: vi.fn(),
        debug: vi.fn(),
      },
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

  it("requires capability approval token for browser.proxy", async () => {
    const previous = process.env.OPENCLAW_ALLOW_BROWSER_PROXY;
    process.env.OPENCLAW_ALLOW_BROWSER_PROXY = "1";
    try {
      const res = await invokeNode(
        {
          nodeId: "node-1",
          command: "browser.proxy",
          params: {
            method: "GET",
            path: "/tabs",
          },
          idempotencyKey: "k-proxy-token",
        },
        { connect: { role: "operator", scopes: ["operator.admin"] } },
      );
      expect(res.ok).toBe(false);
      expect(res.error?.message).toContain("requires capability approval token");
    } finally {
      if (previous === undefined) {
        delete process.env.OPENCLAW_ALLOW_BROWSER_PROXY;
      } else {
        process.env.OPENCLAW_ALLOW_BROWSER_PROXY = previous;
      }
    }
  });

  it("accepts valid capability token and reaches kernel gate", async () => {
    const previous = process.env.OPENCLAW_ALLOW_BROWSER_PROXY;
    process.env.OPENCLAW_ALLOW_BROWSER_PROXY = "1";
    const respond = vi.fn();
    try {
      await nodeHandlers["node.invoke"]({
        req: { type: "req", id: "req-token", method: "node.invoke", params: {} } as never,
        params: {
          nodeId: "node-1",
          command: "browser.proxy",
          params: {
            method: "GET",
            path: "/tabs",
            capabilityApprovalToken: "token-1",
          },
          idempotencyKey: "k-proxy-token-valid",
        },
        client: { connect: { role: "operator", scopes: ["operator.admin"] } } as never,
        isWebchatConnect: () => false,
        respond,
        context: {
          nodeRegistry: {
            get: () => undefined,
            invoke: vi.fn(),
          },
          dedupe: new Map(),
          cronStorePath: "/tmp/openclaw-cron.json",
          logGateway: {
            warn: vi.fn(),
            debug: vi.fn(),
          },
          execApprovalManager: {
            computeBindHash: () => "unused",
            consumeToken: () => true,
          },
        } as never,
      });

      const [ok, , error] = respond.mock.calls[0] ?? [];
      expect(ok).toBe(false);
      expect(error?.message).toContain("node not connected");
    } finally {
      if (previous === undefined) {
        delete process.env.OPENCLAW_ALLOW_BROWSER_PROXY;
      } else {
        process.env.OPENCLAW_ALLOW_BROWSER_PROXY = previous;
      }
    }
  });

  it("blocks system.run deny-pattern commands", async () => {
    const prev = process.env.OPENCLAW_ALLOW_NODE_EXEC;
    process.env.OPENCLAW_ALLOW_NODE_EXEC = "1";
    const respond = vi.fn();
    try {
      await nodeHandlers["node.invoke"]({
        req: { type: "req", id: "req-deny", method: "node.invoke", params: {} } as never,
        params: {
          nodeId: "node-1",
          command: "system.run",
          params: {
            command: ["bash", "-c", "echo risky"],
            sessionKey: "agent:main:test",
            capabilityApprovalToken: "tok-deny",
          },
          idempotencyKey: "k-4",
        },
        client: { connect: { role: "operator", scopes: ["operator.admin"] } } as never,
        isWebchatConnect: () => false,
        respond,
        context: {
          nodeRegistry: {
            get: () => undefined,
            invoke: vi.fn(),
          },
          dedupe: new Map(),
          cronStorePath: "/tmp/openclaw-cron.json",
          logGateway: {
            warn: vi.fn(),
            debug: vi.fn(),
          },
          execApprovalManager: {
            computeBindHash: () => "hash",
            consumeToken: () => true,
          },
        } as never,
      });
      const [ok, , error] = respond.mock.calls[0] ?? [];
      expect(ok).toBe(false);
      expect(error?.message).toContain("shell -c execution is not allowed");
    } finally {
      if (prev === undefined) {
        delete process.env.OPENCLAW_ALLOW_NODE_EXEC;
      } else {
        process.env.OPENCLAW_ALLOW_NODE_EXEC = prev;
      }
    }
  });

  it("requires sessionKey for system.run", async () => {
    const prev = process.env.OPENCLAW_ALLOW_NODE_EXEC;
    process.env.OPENCLAW_ALLOW_NODE_EXEC = "1";
    try {
      const res = await invokeNode(
        {
          nodeId: "node-1",
          command: "system.run",
          params: {
            command: ["echo", "ok"],
          },
          idempotencyKey: "k-5",
        },
        { connect: { role: "operator", scopes: ["operator.admin"] } },
      );
      expect(res.ok).toBe(false);
      expect(res.error?.message).toContain("requires sessionKey");
    } finally {
      if (prev === undefined) {
        delete process.env.OPENCLAW_ALLOW_NODE_EXEC;
      } else {
        process.env.OPENCLAW_ALLOW_NODE_EXEC = prev;
      }
    }
  });

  it("rejects dangerous idempotency replay with mismatched payload", async () => {
    const previous = process.env.OPENCLAW_ALLOW_BROWSER_PROXY;
    process.env.OPENCLAW_ALLOW_BROWSER_PROXY = "1";
    const respondA = vi.fn();
    const respondB = vi.fn();
    const sharedContext = {
      nodeRegistry: {
        get: () => undefined,
        invoke: vi.fn(),
      },
      dedupe: new Map(),
      cronStorePath: "/tmp/openclaw-cron.json",
      logGateway: {
        warn: vi.fn(),
        debug: vi.fn(),
      },
      execApprovalManager: {
        computeBindHash: () => "hash",
        consumeToken: () => false,
      },
    } as never;

    try {
      await nodeHandlers["node.invoke"]({
        req: { type: "req", id: "req-a", method: "node.invoke", params: {} } as never,
        params: {
          nodeId: "node-1",
          command: "browser.proxy",
          params: { method: "GET", path: "/tabs" },
          idempotencyKey: "danger-replay-key",
        },
        client: { connect: { role: "operator", scopes: ["operator.admin"] } } as never,
        isWebchatConnect: () => false,
        respond: respondA,
        context: sharedContext,
      });

      await nodeHandlers["node.invoke"]({
        req: { type: "req", id: "req-b", method: "node.invoke", params: {} } as never,
        params: {
          nodeId: "node-1",
          command: "browser.proxy",
          params: { method: "GET", path: "/different" },
          idempotencyKey: "danger-replay-key",
        },
        client: { connect: { role: "operator", scopes: ["operator.admin"] } } as never,
        isWebchatConnect: () => false,
        respond: respondB,
        context: sharedContext,
      });

      const [ok] = respondB.mock.calls[0] ?? [];
      const [, , error] = respondB.mock.calls[0] ?? [];
      expect(ok).toBe(false);
      expect(error?.message).toContain("idempotency key reused with different payload");
    } finally {
      if (previous === undefined) {
        delete process.env.OPENCLAW_ALLOW_BROWSER_PROXY;
      } else {
        process.env.OPENCLAW_ALLOW_BROWSER_PROXY = previous;
      }
    }
  });

  it("blocks repeated dangerous denials with tripwire", async () => {
    const denialResponses: Array<{ ok?: boolean; errorMessage?: string }> = [];
    const sessionKey = "agent:test:tripwire";
    for (let index = 0; index < 6; index += 1) {
      const res = await invokeNode(
        {
          nodeId: "node-1",
          command: "system.run",
          params: {
            command: ["echo", "ok"],
            sessionKey,
          },
          idempotencyKey: `tripwire-${index}`,
        },
        { connect: { role: "operator", scopes: ["operator.admin"] } },
      );
      denialResponses.push({ ok: res.ok, errorMessage: res.error?.message });
    }
    expect(denialResponses[5]?.ok).toBe(false);
    expect(denialResponses[5]?.errorMessage).toContain("temporarily blocked");
  });
});
