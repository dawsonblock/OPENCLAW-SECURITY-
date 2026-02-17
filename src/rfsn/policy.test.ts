import { afterEach, describe, expect, test } from "vitest";
import { createDefaultRfsnPolicy } from "./policy.js";

const ENV_KEYS = [
  "OPENCLAW_RFSN_ALLOW_TOOLS",
  "OPENCLAW_RFSN_DENY_TOOLS",
  "OPENCLAW_RFSN_MODE",
  "OPENCLAW_RFSN_GRANTED_CAPABILITIES",
  "OPENCLAW_RFSN_EXEC_SAFE_BINS",
  "OPENCLAW_RFSN_FETCH_ALLOW_DOMAINS",
  "OPENCLAW_RFSN_FETCH_ALLOW_SUBDOMAINS",
  "OPENCLAW_RFSN_ENFORCE_FETCH_DOMAIN_ALLOWLIST",
  "OPENCLAW_RFSN_BLOCK_EXEC_COMMAND_SUBSTITUTION",
] as const;

const envSnapshot = new Map<string, string | undefined>();
for (const key of ENV_KEYS) {
  envSnapshot.set(key, process.env[key]);
}

afterEach(() => {
  for (const key of ENV_KEYS) {
    const value = envSnapshot.get(key);
    if (typeof value === "string") {
      process.env[key] = value;
    } else {
      delete process.env[key];
    }
  }
});

describe("createDefaultRfsnPolicy", () => {
  test("ships with deny-by-default allowlist mode and curated tools", () => {
    const policy = createDefaultRfsnPolicy();
    expect(policy.mode).toBe("allowlist");
    expect(policy.allowTools.has("read")).toBe(true);
    expect(policy.allowTools.has("exec")).toBe(true);
    expect(policy.allowTools.has("unknown_tool")).toBe(false);
  });

  test("seeds base capabilities and spawn caps from safe bins", () => {
    const policy = createDefaultRfsnPolicy({
      execSafeBins: ["git", "rg"],
    });
    expect(policy.grantedCapabilities.has("fs:read:workspace")).toBe(true);
    expect(policy.grantedCapabilities.has("fs:write:workspace")).toBe(true);
    expect(policy.grantedCapabilities.has("proc:manage")).toBe(false);
    expect(policy.grantedCapabilities.has("proc:spawn:git")).toBe(true);
    expect(policy.grantedCapabilities.has("proc:spawn:rg")).toBe(true);
  });

  test("applies env overrides for fetch domains and booleans", () => {
    process.env.OPENCLAW_RFSN_FETCH_ALLOW_DOMAINS = "docs.aetherbot.ai,*.github.com";
    process.env.OPENCLAW_RFSN_FETCH_ALLOW_SUBDOMAINS = "0";
    process.env.OPENCLAW_RFSN_ENFORCE_FETCH_DOMAIN_ALLOWLIST = "0";
    process.env.OPENCLAW_RFSN_BLOCK_EXEC_COMMAND_SUBSTITUTION = "0";

    const policy = createDefaultRfsnPolicy();
    expect(policy.fetchAllowedDomains.has("docs.aetherbot.ai")).toBe(true);
    expect(policy.fetchAllowedDomains.has("*.github.com")).toBe(true);
    expect(policy.fetchAllowSubdomains).toBe(false);
    expect(policy.enforceFetchDomainAllowlist).toBe(false);
    expect(policy.blockExecCommandSubstitution).toBe(false);
  });

  test("can disable env overrides explicitly", () => {
    process.env.OPENCLAW_RFSN_ALLOW_TOOLS = "web_fetch";
    process.env.OPENCLAW_RFSN_DENY_TOOLS = "read";
    process.env.OPENCLAW_RFSN_GRANTED_CAPABILITIES = "net:gateway";
    process.env.OPENCLAW_RFSN_EXEC_SAFE_BINS = "curl";
    process.env.OPENCLAW_RFSN_FETCH_ALLOW_DOMAINS = "example.com";
    process.env.OPENCLAW_RFSN_MODE = "allow_all";

    const policy = createDefaultRfsnPolicy({
      useEnvOverrides: false,
      mode: "allowlist",
      allowTools: ["read"],
      denyTools: [],
      grantedCapabilities: ["fs:read:workspace"],
      execSafeBins: ["rg"],
      fetchAllowedDomains: ["docs.aetherbot.ai"],
    });

    expect(policy.mode).toBe("allowlist");
    expect(policy.allowTools.has("read")).toBe(true);
    expect(policy.allowTools.has("web_fetch")).toBe(false);
    expect(policy.denyTools.has("read")).toBe(false);
    expect(policy.grantedCapabilities.has("net:gateway")).toBe(false);
    expect(policy.execSafeBins.has("curl")).toBe(false);
    expect(policy.fetchAllowedDomains.has("example.com")).toBe(false);
    expect(policy.fetchAllowedDomains.has("docs.aetherbot.ai")).toBe(true);
  });

  test("can create minimal policies without default granted caps/bins", () => {
    const policy = createDefaultRfsnPolicy({
      includeDefaultGrantedCapabilities: false,
      includeDefaultExecSafeBins: false,
      grantedCapabilities: ["net:browser"],
      execSafeBins: [],
    });

    expect(policy.grantedCapabilities.has("fs:read:workspace")).toBe(false);
    expect(policy.grantedCapabilities.has("fs:write:workspace")).toBe(false);
    expect(policy.execSafeBins.size).toBe(0);
    expect(policy.grantedCapabilities.has("net:browser")).toBe(true);
  });

  test("default policy never grants browser:unsafe_eval", () => {
    const policy = createDefaultRfsnPolicy();
    expect(policy.grantedCapabilities.has("browser:unsafe_eval")).toBe(false);
  });
});
