import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type BrowserBridge,
  startBrowserBridgeServer,
  stopBrowserBridgeServer,
} from "./bridge-server.js";
import { type ResolvedBrowserConfig } from "./config.js";

const mockResolvedConfig: ResolvedBrowserConfig = {
  enabled: true,
  image: "mock-image",
  containerPrefix: "mock-prefix",
  cdpPort: 9222,
  vncPort: 5900,
  noVncPort: 6080,
  headless: true,
  enableNoVnc: true,
  allowHostControl: false,
  autoStart: false,
  autoStartTimeoutMs: 1000,
};

describe("bridge-server auth & hardening", () => {
  let bridge: BrowserBridge | undefined;

  afterEach(async () => {
    if (bridge) {
      await stopBrowserBridgeServer(bridge.server);
      bridge = undefined;
    }
    vi.restoreAllMocks();
  });

  it("rejects POST requests without application/json content-type", async () => {
    bridge = await startBrowserBridgeServer({
      resolved: mockResolvedConfig,
      port: 0,
    });
    const url = `${bridge.baseUrl}/agent/act`;

    // 1. Text/plain - should fail (415 Unsupported Media Type)
    const resText = await fetch(url, {
      method: "POST",
      body: "{}",
      headers: { "Content-Type": "text/plain" },
    });
    expect(resText.status).toBe(415);

    // 2. No content-type - should fail
    const resNone = await fetch(url, {
      method: "POST",
      body: "{}",
    });
    expect(resNone.status).toBe(415);
  });

  it("validates Origin header if present", async () => {
    bridge = await startBrowserBridgeServer({
      resolved: mockResolvedConfig,
      port: 0,
    });
    const url = `${bridge.baseUrl}/agent/act`;

    // 1. Allowed Origin (vscode-webview) - should pass (not 403)
    // Note: It might 404 because route logic isn't fully mocked, but importantly NOT 403.
    const resAllowed = await fetch(url, {
      method: "POST",
      body: "{}",
      headers: {
        "Content-Type": "application/json",
        Origin: "vscode-webview://123",
      },
    });
    expect(resAllowed.status).not.toBe(403);

    // 2. Allowed Origin (file) - should pass
    const resFile = await fetch(url, {
      method: "POST",
      body: "{}",
      headers: {
        "Content-Type": "application/json",
        Origin: "file://",
      },
    });
    expect(resFile.status).not.toBe(403);

    // 3. Blocked Origin - should fail
    const resEvil = await fetch(url, {
      method: "POST",
      body: "{}",
      headers: {
        "Content-Type": "application/json",
        Origin: "http://evil.com",
      },
    });
    expect(resEvil.status).toBe(403);
  });
});
