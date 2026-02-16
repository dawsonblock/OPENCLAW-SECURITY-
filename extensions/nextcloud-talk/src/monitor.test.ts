import type { AddressInfo } from "node:net";
import { request } from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createNextcloudTalkWebhookServer } from "./monitor.js";
import { generateNextcloudTalkSignature } from "./signature.js";

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
        res.on("end", () => resolve({ status: res.statusCode ?? 0, body }));
      },
    );
    req.on("error", reject);
    req.write(params.body);
    req.end();
  });
}

describe("nextcloud talk webhook server", () => {
  const servers: Array<{ stop: () => void }> = [];

  afterEach(() => {
    for (const server of servers) {
      server.stop();
    }
    servers.length = 0;
  });

  it("rejects oversized webhook payloads", async () => {
    const onMessage = vi.fn();
    const svc = createNextcloudTalkWebhookServer({
      port: 0,
      host: "127.0.0.1",
      path: "/hook",
      secret: "topsecret",
      maxBodyBytes: 32,
      onMessage,
    });
    servers.push(svc);
    await svc.start();
    const address = svc.server.address() as AddressInfo;

    const oversized = "x".repeat(128);
    const signature = generateNextcloudTalkSignature({ body: oversized, secret: "topsecret" });
    const res = await postRaw({
      port: address.port,
      path: "/hook",
      body: oversized,
      headers: {
        "content-type": "application/json",
        "content-length": String(Buffer.byteLength(oversized, "utf8")),
        "x-nextcloud-talk-signature": signature.signature,
        "x-nextcloud-talk-random": signature.random,
        "x-nextcloud-talk-backend": "https://cloud.example.com",
      },
    });

    expect(res.status).toBe(413);
    expect(onMessage).not.toHaveBeenCalled();
  });

  it("accepts valid signed create payloads within size limit", async () => {
    const delivered = vi.fn();
    const svc = createNextcloudTalkWebhookServer({
      port: 0,
      host: "127.0.0.1",
      path: "/hook",
      secret: "topsecret",
      maxBodyBytes: 4096,
      onMessage: async (msg) => {
        delivered(msg);
      },
    });
    servers.push(svc);
    await svc.start();
    const address = svc.server.address() as AddressInfo;

    const body = JSON.stringify({
      type: "Create",
      actor: { type: "Person", id: "u1", name: "Alice" },
      object: { type: "Note", id: "m1", name: "Hello", content: "Hello", mediaType: "text/plain" },
      target: { type: "Collection", id: "r1", name: "Room" },
    });
    const signature = generateNextcloudTalkSignature({ body, secret: "topsecret" });
    const res = await fetch(`http://127.0.0.1:${address.port}/hook`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-nextcloud-talk-signature": signature.signature,
        "x-nextcloud-talk-random": signature.random,
        "x-nextcloud-talk-backend": "https://cloud.example.com",
      },
      body,
    });

    expect(res.status).toBe(200);
    expect(delivered).toHaveBeenCalledTimes(1);
    expect(delivered.mock.calls[0]?.[0]).toMatchObject({
      messageId: "m1",
      roomToken: "r1",
      senderId: "u1",
      text: "Hello",
    });
  });
});
