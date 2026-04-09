import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { WebSocket, WebSocketServer } from "ws";
import type { CanvasHostHandler } from "../canvas-host/server.js";
import type { ResolvedGatewayAuth } from "./auth.js";
import type { GatewayWsClient } from "./server/ws-types.js";
import { A2UI_PATH, CANVAS_HOST_PATH, CANVAS_WS_PATH } from "../canvas-host/a2ui.js";
import { attachGatewayUpgradeHandler, createGatewayHttpServer } from "./server-http.js";

async function withTempConfig(params: { cfg: unknown; run: () => Promise<void> }): Promise<void> {
  const prevConfigPath = process.env.OPENCLAW_CONFIG_PATH;
  const prevDisableCache = process.env.OPENCLAW_DISABLE_CONFIG_CACHE;

  const dir = await mkdtemp(path.join(os.tmpdir(), "openclaw-canvas-auth-test-"));
  const configPath = path.join(dir, "openclaw.json");

  process.env.OPENCLAW_CONFIG_PATH = configPath;
  process.env.OPENCLAW_DISABLE_CONFIG_CACHE = "1";

  try {
    await writeFile(configPath, JSON.stringify(params.cfg, null, 2), "utf-8");
    await params.run();
  } finally {
    if (prevConfigPath === undefined) {
      delete process.env.OPENCLAW_CONFIG_PATH;
    } else {
      process.env.OPENCLAW_CONFIG_PATH = prevConfigPath;
    }
    if (prevDisableCache === undefined) {
      delete process.env.OPENCLAW_DISABLE_CONFIG_CACHE;
    } else {
      process.env.OPENCLAW_DISABLE_CONFIG_CACHE = prevDisableCache;
    }
    await rm(dir, { recursive: true, force: true });
  }
}

async function listen(server: ReturnType<typeof createGatewayHttpServer>): Promise<{
  port: number;
  close: () => Promise<void>;
}> {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const addr = server.address();
  const port = typeof addr === "object" && addr ? addr.port : 0;
  return {
    port,
    close: async () => {
      await new Promise<void>((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve())),
      );
    },
  };
}

async function expectWsRejected(url: string, headers: Record<string, string>): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const ws = new WebSocket(url, { headers });
    const timer = setTimeout(() => reject(new Error("timeout")), 10_000);
    ws.once("open", () => {
      clearTimeout(timer);
      ws.terminate();
      reject(new Error("expected ws to reject"));
    });
    ws.once("unexpected-response", (_req, res) => {
      clearTimeout(timer);
      expect(res.statusCode).toBe(401);
      resolve();
    });
    ws.once("error", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

async function expectWsAccepted(url: string, headers: Record<string, string>): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const ws = new WebSocket(url, { headers });
    const timer = setTimeout(() => reject(new Error("timeout")), 10_000);
    ws.once("open", () => {
      clearTimeout(timer);
      ws.terminate();
      resolve();
    });
    ws.once("unexpected-response", (_req, res) => {
      clearTimeout(timer);
      reject(new Error(`unexpected response ${res.statusCode}`));
    });
    ws.once("error", reject);
  });
}

function createCanvasHost(): { canvasHost: CanvasHostHandler; canvasWss: WebSocketServer } {
  const canvasWss = new WebSocketServer({ noServer: true });
  const canvasHost: CanvasHostHandler = {
    rootDir: "test",
    close: async () => {},
    handleUpgrade: (req, socket, head) => {
      const url = new URL(req.url ?? "/", "http://localhost");
      if (url.pathname !== CANVAS_WS_PATH) {
        return false;
      }
      canvasWss.handleUpgrade(req, socket, head, (ws) => ws.close());
      return true;
    },
    handleHttpRequest: async (req, res) => {
      const url = new URL(req.url ?? "/", "http://localhost");
      if (url.pathname !== CANVAS_HOST_PATH && !url.pathname.startsWith(`${CANVAS_HOST_PATH}/`)) {
        return false;
      }
      res.statusCode = 200;
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.end("ok");
      return true;
    },
  };
  return { canvasHost, canvasWss };
}

async function withCanvasGateway(params: {
  cfg: unknown;
  resolvedAuth: ResolvedGatewayAuth;
  clients?: Set<GatewayWsClient>;
  run: (value: { port: number }) => Promise<void>;
}) {
  await withTempConfig({
    cfg: params.cfg,
    run: async () => {
      const clients = params.clients ?? new Set<GatewayWsClient>();
      const { canvasHost, canvasWss } = createCanvasHost();
      const httpServer = createGatewayHttpServer({
        canvasHost,
        clients,
        controlUiEnabled: false,
        controlUiBasePath: "/__control__",
        openAiChatCompletionsEnabled: false,
        openResponsesEnabled: false,
        handleHooksRequest: async () => false,
        resolvedAuth: params.resolvedAuth,
      });
      const wss = new WebSocketServer({ noServer: true });
      attachGatewayUpgradeHandler({
        httpServer,
        wss,
        canvasHost,
        clients,
        resolvedAuth: params.resolvedAuth,
      });

      const listener = await listen(httpServer);
      try {
        await params.run({ port: listener.port });
      } finally {
        await listener.close();
        canvasWss.close();
        wss.close();
      }
    },
  });
}

const resolvedAuth: ResolvedGatewayAuth = {
  mode: "token",
  token: "test-token",
  password: undefined,
  allowTailscale: false,
};

describe("gateway canvas host auth", () => {
  test("rejects remote requests without a token even when another websocket client from the same ip is authorized", async () => {
    const clients = new Set<GatewayWsClient>();
    clients.add({
      socket: {} as unknown as WebSocket,
      connect: {} as never,
      connId: "c1",
      clientIp: "203.0.113.10",
    });

    await withCanvasGateway({
      cfg: {
        gateway: {
          trustedProxies: ["127.0.0.1"],
        },
      },
      resolvedAuth,
      clients,
      run: async ({ port }) => {
        const unauthCanvas = await fetch(`http://127.0.0.1:${port}${CANVAS_HOST_PATH}/`, {
          headers: { "x-forwarded-for": "203.0.113.10" },
        });
        expect(unauthCanvas.status).toBe(401);

        const unauthA2ui = await fetch(`http://127.0.0.1:${port}${A2UI_PATH}/`, {
          headers: { "x-forwarded-for": "203.0.113.10" },
        });
        expect(unauthA2ui.status).toBe(401);

        await expectWsRejected(`ws://127.0.0.1:${port}${CANVAS_WS_PATH}`, {
          "x-forwarded-for": "203.0.113.10",
        });
      },
    });
  }, 60_000);

  test("accepts explicit bearer auth for remote canvas requests", async () => {
    await withCanvasGateway({
      cfg: {
        gateway: {
          trustedProxies: ["127.0.0.1"],
        },
      },
      resolvedAuth,
      run: async ({ port }) => {
        const authCanvas = await fetch(`http://127.0.0.1:${port}${CANVAS_HOST_PATH}/`, {
          headers: {
            authorization: "Bearer test-token",
            "x-forwarded-for": "203.0.113.10",
          },
        });
        expect(authCanvas.status).toBe(200);
        expect(await authCanvas.text()).toBe("ok");

        await expectWsAccepted(`ws://127.0.0.1:${port}${CANVAS_WS_PATH}`, {
          authorization: "Bearer test-token",
          "x-forwarded-for": "203.0.113.10",
        });
      },
    });
  }, 60_000);

  test("still accepts local direct canvas requests", async () => {
    await withCanvasGateway({
      cfg: { gateway: {} },
      resolvedAuth,
      run: async ({ port }) => {
        const localCanvas = await fetch(`http://127.0.0.1:${port}${CANVAS_HOST_PATH}/`);
        expect(localCanvas.status).toBe(200);
        expect(await localCanvas.text()).toBe("ok");
      },
    });
  }, 60_000);

  test("does not trust untrusted forwarded headers to fake locality", async () => {
    await withCanvasGateway({
      cfg: { gateway: { trustedProxies: [] } },
      resolvedAuth,
      run: async ({ port }) => {
        const fakeLocal = await fetch(`http://127.0.0.1:${port}${CANVAS_HOST_PATH}/`, {
          headers: {
            host: "localhost",
            "x-forwarded-for": "127.0.0.1",
            "x-real-ip": "127.0.0.1",
          },
        });
        expect(fakeLocal.status).toBe(401);
      },
    });
  }, 60_000);
});
