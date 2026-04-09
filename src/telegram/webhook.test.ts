import { request } from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import { startTelegramWebhook } from "./webhook.js";

const handlerSpy = vi.fn(
  (_req: unknown, res: { writeHead: (status: number) => void; end: (body?: string) => void }) => {
    res.writeHead(200);
    res.end("ok");
  },
);
const setWebhookSpy = vi.fn();
const stopSpy = vi.fn();

const createTelegramBotSpy = vi.fn(() => ({
  api: { setWebhook: setWebhookSpy },
  stop: stopSpy,
}));

vi.mock("grammy", async (importOriginal) => {
  const actual = await importOriginal<typeof import("grammy")>();
  return { ...actual, webhookCallback: () => handlerSpy };
});

vi.mock("./bot.js", () => ({
  createTelegramBot: (...args: unknown[]) => createTelegramBotSpy(...args),
}));

async function postRaw(params: {
  port: number;
  path: string;
  body: string;
  headers?: Record<string, string>;
}) {
  return await new Promise<{ status: number; body: string }>((resolve, reject) => {
    const req = request(
      {
        method: "POST",
        host: "127.0.0.1",
        port: params.port,
        path: params.path,
        headers: params.headers,
      },
      (res) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          body += chunk;
        });
        res.on("end", () => {
          resolve({ status: res.statusCode ?? 0, body });
        });
      },
    );
    req.on("error", reject);
    req.write(params.body);
    req.end();
  });
}

describe("startTelegramWebhook", () => {
  afterEach(() => {
    delete process.env.OPENCLAW_TELEGRAM_WEBHOOK_ALLOW_LAN;
  });

  it("starts server, registers webhook, and serves health", async () => {
    createTelegramBotSpy.mockClear();
    const abort = new AbortController();
    const cfg = { bindings: [] };
    const { server } = await startTelegramWebhook({
      token: "tok",
      accountId: "opie",
      config: cfg,
      port: 0, // random free port
      abortSignal: abort.signal,
    });
    expect(createTelegramBotSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId: "opie",
        config: expect.objectContaining({ bindings: [] }),
      }),
    );
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("no address");
    }
    const url = `http://127.0.0.1:${address.port}`;

    const health = await fetch(`${url}/healthz`);
    expect(health.status).toBe(200);
    expect(setWebhookSpy).toHaveBeenCalled();

    abort.abort();
  });

  it("invokes webhook handler on matching path", async () => {
    handlerSpy.mockClear();
    createTelegramBotSpy.mockClear();
    const abort = new AbortController();
    const cfg = { bindings: [] };
    const { server } = await startTelegramWebhook({
      token: "tok",
      accountId: "opie",
      config: cfg,
      port: 0,
      abortSignal: abort.signal,
      path: "/hook",
    });
    expect(createTelegramBotSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId: "opie",
        config: expect.objectContaining({ bindings: [] }),
      }),
    );
    const addr = server.address();
    if (!addr || typeof addr === "string") {
      throw new Error("no addr");
    }
    await fetch(`http://127.0.0.1:${addr.port}/hook`, { method: "POST" });
    expect(handlerSpy).toHaveBeenCalled();
    abort.abort();
  });

  it("rejects non-loopback hosts unless explicitly allowed", async () => {
    await expect(
      startTelegramWebhook({
        token: "tok",
        config: { bindings: [] },
        host: "0.0.0.0",
        port: 0,
      }),
    ).rejects.toThrow("OPENCLAW_TELEGRAM_WEBHOOK_ALLOW_LAN=1");

    process.env.OPENCLAW_TELEGRAM_WEBHOOK_ALLOW_LAN = "1";
    await expect(
      startTelegramWebhook({
        token: "tok",
        config: { bindings: [] },
        host: "0.0.0.0",
        port: 0,
      }),
    ).rejects.toThrow("requires a secret token");

    const abort = new AbortController();
    const { stop } = await startTelegramWebhook({
      token: "tok",
      config: { bindings: [] },
      host: "0.0.0.0",
      port: 0,
      secret: "lan-secret",
      abortSignal: abort.signal,
    });
    stop();
  });

  it("rejects oversized webhook requests before invoking handler", async () => {
    handlerSpy.mockClear();
    const abort = new AbortController();
    const { server } = await startTelegramWebhook({
      token: "tok",
      config: { bindings: [] },
      port: 0,
      maxBodyBytes: 8,
      abortSignal: abort.signal,
    });

    const addr = server.address();
    if (!addr || typeof addr === "string") {
      throw new Error("no addr");
    }

    const res = await postRaw({
      port: addr.port,
      path: "/telegram-webhook",
      body: "0123456789abcdef0123456789abcdef",
      headers: {
        "content-type": "application/json",
        "content-length": "32",
      },
    });

    expect(res.status).toBe(413);
    expect(handlerSpy).not.toHaveBeenCalled();
    abort.abort();
  });
});
