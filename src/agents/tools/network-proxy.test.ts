/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as fetchGuard from "../../infra/net/fetch-guard.js";
import { createNetworkProxyTool } from "./network-proxy.js";

// Mock fetchWithSsrFGuard
vi.mock("../../infra/net/fetch-guard.js", () => ({
  fetchWithSsrFGuard: vi.fn(),
}));

describe("network_proxy tool", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.OPENCLAW_NETWORK_ALLOW_ALL;
    vi.resetAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  const mockSuccess = () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (fetchGuard.fetchWithSsrFGuard as any).mockResolvedValue({
      response: {
        ok: true,
        status: 200,
        statusText: "OK",
        url: "https://example.com",
        headers: { get: () => "text/plain" },
        text: async () => "Mock Content",
      },
      release: vi.fn(),
    });
  };

  it("denies all by default if no allowlist is configured", async () => {
    const tool = createNetworkProxyTool({ config: {} });
    await expect(tool.execute("id", { url: "https://example.com" })).rejects.toThrow(
      "Network Proxy Denied: network egress is disabled for this tool",
    );
  });

  it("allows access to allowlisted domains", async () => {
    mockSuccess();
    const tool = createNetworkProxyTool({
      config: {
        security: {
          network: {
            allowlist: ["example.com"],
          },
        },
      },
    });

    const result = await tool.execute("id", { url: "https://example.com/foo" });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const content = (result as any).content[0].text;
    const data = JSON.parse(content);
    expect(data).toHaveProperty("content", "Mock Content");
  });

  it("denies access to non-allowlisted domains", async () => {
    const tool = createNetworkProxyTool({
      config: {
        security: {
          network: {
            allowlist: ["example.com"],
          },
        },
      },
    });

    await expect(tool.execute("id", { url: "https://evil.com" })).rejects.toThrow(
      "Network Proxy Denied: domain not allowlisted",
    );
  });

  it("allows all if OPENCLAW_NETWORK_ALLOW_ALL is set", async () => {
    process.env.OPENCLAW_NETWORK_ALLOW_ALL = "1";
    mockSuccess();

    // No config provided, usually would deny all
    const tool = createNetworkProxyTool({ config: {} });

    const result = await tool.execute("id", { url: "https://random.com" });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const content = (result as any).content[0].text;
    const data = JSON.parse(content);
    expect(data).toHaveProperty("content", "Mock Content");
  });

  it("always denies private IPs even with allowlist", async () => {
    // Even if we allow *, private IPs should be blocked by policy.denyPrivate = true
    // Note: validateEgressTarget handles this logic.
    // We need to make sure our policy construction sets denyPrivate=true.

    const tool = createNetworkProxyTool({
      config: {
        security: {
          network: {
            allowlist: ["*"], // Allow everything
          },
        },
      },
    });

    // 127.0.0.1 is private/loopback
    await expect(tool.execute("id", { url: "http://127.0.0.1" })).rejects.toThrow(
      /private IP target denied|raw IP target denied/,
    );
  });
});
