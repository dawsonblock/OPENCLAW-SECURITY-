import { afterEach, describe, expect, it } from "vitest";
import { startBrowserBridgeServer, stopBrowserBridgeServer } from "./bridge-server.js";
import { resolveBrowserConfig } from "./config.js";

describe("browser bridge auth", () => {
  const servers: Array<{ close: () => Promise<void> }> = [];

  afterEach(async () => {
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
});
