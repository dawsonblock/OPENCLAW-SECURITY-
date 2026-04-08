import { afterEach, describe, expect, it } from "vitest";
import type { OpenClawConfig } from "../../config/config.js";
import {
  assertPolicyDrift,
  computePolicySnapshotHash,
  initializePolicySnapshot,
  resetPolicySnapshotForTests,
} from "./policy-snapshot.js";
import { assertDangerousCapabilityInvariants } from "./runtime-assert.js";

const baseConfig: OpenClawConfig = {
  gateway: {
    bind: "loopback",
    tailscale: {
      mode: "off",
    },
    nodes: {
      allowCommands: [],
    },
  },
};

function buildConfig(overrides?: Partial<OpenClawConfig>): OpenClawConfig {
  return {
    ...baseConfig,
    ...overrides,
    gateway: {
      ...baseConfig.gateway,
      ...overrides?.gateway,
      tailscale: {
        ...baseConfig.gateway?.tailscale,
        ...overrides?.gateway?.tailscale,
      },
      nodes: {
        ...baseConfig.gateway?.nodes,
        ...overrides?.gateway?.nodes,
      },
    },
  };
}

function computeHash(cfg: OpenClawConfig): string {
  return computePolicySnapshotHash({
    cfg,
    env: {},
    bindHost: "127.0.0.1",
    tailscaleMode: "off",
  });
}

afterEach(() => {
  resetPolicySnapshotForTests();
});

describe("assertPolicyDrift", () => {
  it("passes when the current hash matches the baseline", () => {
    const cfg = buildConfig();
    const hash = computeHash(cfg);
    initializePolicySnapshot(hash);

    expect(() => assertPolicyDrift(hash, false)).not.toThrow();
  });

  it("fails when the current hash changes without break-glass", () => {
    initializePolicySnapshot(computeHash(buildConfig()));

    expect(() =>
      assertPolicyDrift(
        computeHash(
          buildConfig({
            gateway: {
              nodes: {
                allowCommands: ["system.run"],
              },
            },
          }),
        ),
        false,
      ),
    ).toThrow(/policy/i);
  });

  it("passes when the current hash changes with explicit break-glass", () => {
    initializePolicySnapshot(computeHash(buildConfig()));

    expect(() =>
      assertPolicyDrift(
        computeHash(
          buildConfig({
            gateway: {
              nodes: {
                allowCommands: ["system.run"],
              },
            },
          }),
        ),
        true,
      ),
    ).not.toThrow();
  });
});

describe("assertDangerousCapabilityInvariants", () => {
  it("enforces policy drift before dangerous execution proceeds", async () => {
    initializePolicySnapshot(computeHash(buildConfig()));

    await expect(
      assertDangerousCapabilityInvariants(
        "node.system.run",
        {},
        {
          cfg: buildConfig({
            gateway: {
              nodes: {
                allowCommands: ["system.run"],
              },
            },
          }),
          bindHost: "127.0.0.1",
          tailscaleMode: "off",
          env: {
            OPENCLAW_ALLOW_NODE_EXEC: "1",
          },
        },
      ),
    ).rejects.toThrow(/policy/i);
  });
});
