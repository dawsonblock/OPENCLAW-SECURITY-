import { afterEach, describe, expect, it } from "vitest";
import type { LookupFn } from "../infra/net/ssrf.js";
import { mergeHeadersSafe, sanitizeRemoteBaseUrl } from "./provider-remote.js";

const PUBLIC_LOOKUP: LookupFn = async () => [{ address: "93.184.216.34", family: 4 }];
const PRIVATE_LOOKUP: LookupFn = async () => [{ address: "127.0.0.1", family: 4 }];

describe("provider remote security", () => {
  afterEach(() => {
    delete process.env.OPENCLAW_ALLOW_CUSTOM_EMBEDDINGS_BASEURL;
    delete process.env.OPENCLAW_ALLOW_PRIVATE_EMBEDDINGS_BASEURL;
  });

  it("rejects non-https base URLs", async () => {
    await expect(
      sanitizeRemoteBaseUrl({
        baseUrl: "http://example.com/v1",
        defaultBaseUrl: "https://api.openai.com/v1",
        lookupFn: PUBLIC_LOOKUP,
      }),
    ).rejects.toThrow("https required");
  });

  it("rejects private hosts by default", async () => {
    await expect(
      sanitizeRemoteBaseUrl({
        baseUrl: "https://example.com/v1",
        defaultBaseUrl: "https://api.openai.com/v1",
        lookupFn: PRIVATE_LOOKUP,
      }),
    ).rejects.toThrow("private/internal");
  });

  it("blocks custom hosts for runtime overrides unless explicitly allowed", async () => {
    await expect(
      sanitizeRemoteBaseUrl({
        baseUrl: "https://example.com/v1",
        defaultBaseUrl: "https://api.openai.com/v1",
        lookupFn: PUBLIC_LOOKUP,
        requireCustomHostOptIn: true,
      }),
    ).rejects.toThrow("Blocked custom embeddings base URL host");
  });

  it("allows custom hosts when explicitly opted in", async () => {
    process.env.OPENCLAW_ALLOW_CUSTOM_EMBEDDINGS_BASEURL = "1";
    await expect(
      sanitizeRemoteBaseUrl({
        baseUrl: "https://example.com/v1",
        defaultBaseUrl: "https://api.openai.com/v1",
        lookupFn: PUBLIC_LOOKUP,
        requireCustomHostOptIn: true,
      }),
    ).resolves.toBe("https://example.com/v1");
  });

  it("removes protected auth/proxy headers from overrides", () => {
    const headers = mergeHeadersSafe({
      providerHeaders: {
        "X-Provider": "1",
        Authorization: "Bearer provider",
      },
      remoteHeaders: {
        "X-Remote": "2",
        "x-goog-api-key": "override",
        Cookie: "session=bad",
      },
    });

    expect(headers["X-Provider"]).toBe("1");
    expect(headers["X-Remote"]).toBe("2");
    expect(headers.Authorization).toBeUndefined();
    expect(headers["x-goog-api-key"]).toBeUndefined();
    expect(headers.Cookie).toBeUndefined();
  });
});
