import { describe, expect, it } from "vitest";
import type { OpenClawConfig } from "../config/config.js";
import { calculatePostureHash } from "./posture.js";

describe("Posture Hash", () => {
  const baseConfig: OpenClawConfig = {
    security: {
      model: {
        providerAllowlist: ["openai", "anthropic"],
      },
    },
    agents: {
      defaults: {
        sandbox: {
          fs: {
            allow: ["/tmp"],
          },
          docker: {
            network: "none",
          },
          executionBudget: {
            timeoutMs: 1000,
          },
        },
      },
    },
  };

  it("generates a stable hash for the same config", () => {
    const hash1 = calculatePostureHash(baseConfig);
    const hash2 = calculatePostureHash(baseConfig);
    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(64); // SHA-256 hex
  });

  it("changes hash when allowlist changes", () => {
    const hash1 = calculatePostureHash(baseConfig);
    const modified = JSON.parse(JSON.stringify(baseConfig));
    modified.security.model.providerAllowlist.push("google");
    const hash2 = calculatePostureHash(modified);
    expect(hash1).not.toBe(hash2);
  });

  it("changes hash when budget changes", () => {
    const hash1 = calculatePostureHash(baseConfig);
    const modified = JSON.parse(JSON.stringify(baseConfig));
    if (modified.agents?.defaults?.sandbox?.executionBudget) {
      modified.agents.defaults.sandbox.executionBudget.timeoutMs = 2000;
    }
    const hash2 = calculatePostureHash(modified);
    expect(hash1).not.toBe(hash2);
  });

  it("is insensitive to array order in allowlists (canonicalization)", () => {
    const c1 = JSON.parse(JSON.stringify(baseConfig));
    c1.security.model.providerAllowlist = ["a", "b"];

    const c2 = JSON.parse(JSON.stringify(baseConfig));
    c2.security.model.providerAllowlist = ["b", "a"]; // swapped

    expect(calculatePostureHash(c1)).toBe(calculatePostureHash(c2));
  });
});
