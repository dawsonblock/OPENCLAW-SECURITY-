import { afterEach, describe, expect, it } from "vitest";
import { startBrowserBridgeServer, stopBrowserBridgeServer } from "./bridge-server.js";
import { resolveBrowserConfig } from "./config.js";

describe("browser bridge auth", () => {
  const servers: Array<{ close: () => Promise<void> }> = [];
  const originalAllowLan = process.env.OPENCLAW_BROWSER_BRIDGE_ALLOW_LAN;

  afterEach(async () => {
    if (typeof originalAllowLan === "string") {
      process.env.OPENCLAW_BROWSER_BRIDGE_ALLOW_LAN = originalAllowLan;
    } else {
      delete process.env.OPENCLAW_BROWSER_BRIDGE_ALLOW_LAN;
    }
    while (servers.length > 0) {
      const next = servers.pop();
      if (!next) {
        continue;
      }
      await next.close();
    }
  });

  it("requires bearer auth when authToken is configured", async () => {
    const bridge = await startBrowserBridgeServer({
      resolved: resolveBrowserConfig({ enabled: true }),
      authToken: "bridge-secret",
    });
    servers.push({
      close: async () => stopBrowserBridgeServer(bridge.server),
    });

    const unauthenticated = await fetch(`${bridge.baseUrl}/__unknown__`);
    expect(unauthenticated.status).toBe(401);

    const authenticated = await fetch(`${bridge.baseUrl}/__unknown__`, {
      headers: {
        Authorization: "Bearer bridge-secret",
      },
    });
    expect(authenticated.status).not.toBe(401);
  });

  it("rejects non-loopback binding unless explicitly allowed", async () => {
    delete process.env.OPENCLAW_BROWSER_BRIDGE_ALLOW_LAN;
    await expect(
      startBrowserBridgeServer({
        resolved: resolveBrowserConfig({ enabled: true }),
        host: "0.0.0.0",
      }),
    ).rejects.toThrow("OPENCLAW_BROWSER_BRIDGE_ALLOW_LAN=1");
  });

  it("requires authToken when binding non-loopback", async () => {
    process.env.OPENCLAW_BROWSER_BRIDGE_ALLOW_LAN = "1";
    await expect(
      startBrowserBridgeServer({
        resolved: resolveBrowserConfig({ enabled: true }),
        host: "0.0.0.0",
      }),
    ).rejects.toThrow("requires authToken");
  });
});
