import { describe, expect, it, vi, beforeEach } from "vitest";
import { fetchJson } from "../infra/provider-usage.fetch.shared.js";

describe("provider-remote allowlist", () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("allows requests when no allowlist is configured", async () => {
    mockFetch.mockResolvedValue(new Response("{}"));
    await fetchJson("https://api.openai.com/v1/chat", {}, 1000, mockFetch, {});
    expect(mockFetch).toHaveBeenCalled();
  });

  it("allows requests matching the allowlist", async () => {
    mockFetch.mockResolvedValue(new Response("{}"));
    const config = {
      security: {
        model: {
          providerAllowlist: ["openai.com", "anthropic.com"],
        },
      },
    };
    await fetchJson("https://api.openai.com/v1/chat", {}, 1000, mockFetch, config);
    expect(mockFetch).toHaveBeenCalled();
  });

  it("blocks requests not in the allowlist", async () => {
    const config = {
      security: {
        model: {
          providerAllowlist: ["openai.com"],
        },
      },
    };

    await expect(
      fetchJson("https://api.anthropic.com/v1/messages", {}, 1000, mockFetch, config),
    ).rejects.toThrow(/blocked by security policy/);

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("supports regex in allowlist", async () => {
    mockFetch.mockResolvedValue(new Response("{}"));
    const config = {
      security: {
        model: {
          providerAllowlist: ["^https://.*\\.internal\\.ai"],
        },
      },
    };

    await fetchJson("https://model.internal.ai/v1", {}, 1000, mockFetch, config);
    expect(mockFetch).toHaveBeenCalled();

    await expect(
      fetchJson("https://external.ai/v1", {}, 1000, mockFetch, config),
    ).rejects.toThrow();
  });
});
