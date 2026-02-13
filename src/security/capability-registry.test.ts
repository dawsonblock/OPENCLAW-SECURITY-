import { describe, expect, it } from "vitest";
import {
  isBreakGlassEnvEnabled,
  resolveNodeCommandCapabilityPolicy,
} from "./capability-registry.js";

describe("resolveNodeCommandCapabilityPolicy", () => {
  it("marks system.run as dangerous and session-bound", () => {
    const policy = resolveNodeCommandCapabilityPolicy("system.run");
    expect(policy.dangerous).toBe(true);
    expect(policy.requiresSessionKey).toBe(true);
    expect(policy.requiresApprovalToken).toBe(false);
    expect(policy.requiresAdmin).toBe(false);
  });

  it("marks policy mutation as admin + break-glass", () => {
    const policy = resolveNodeCommandCapabilityPolicy("system.execApprovals.set");
    expect(policy.requiresAdmin).toBe(true);
    expect(policy.requiresApprovalToken).toBe(true);
    expect(policy.breakGlassEnv).toBe("OPENCLAW_ALLOW_POLICY_MUTATION");
  });

  it("requires capability token for browser proxy", () => {
    const policy = resolveNodeCommandCapabilityPolicy("browser.proxy");
    expect(policy.requiresApprovalToken).toBe(true);
    expect(policy.requiresAdmin).toBe(true);
  });

  it("returns non-dangerous defaults for unknown commands", () => {
    const policy = resolveNodeCommandCapabilityPolicy("custom.hello");
    expect(policy.dangerous).toBe(false);
    expect(policy.requiresAdmin).toBe(false);
    expect(policy.requiresSessionKey).toBe(false);
    expect(policy.requiresApprovalToken).toBe(false);
  });
});

describe("isBreakGlassEnvEnabled", () => {
  it("accepts 1/true values", () => {
    expect(
      isBreakGlassEnvEnabled(
        { OPENCLAW_ALLOW_BROWSER_PROXY: "1" } as NodeJS.ProcessEnv,
        "OPENCLAW_ALLOW_BROWSER_PROXY",
      ),
    ).toBe(true);
    expect(
      isBreakGlassEnvEnabled(
        { OPENCLAW_ALLOW_BROWSER_PROXY: "true" } as NodeJS.ProcessEnv,
        "OPENCLAW_ALLOW_BROWSER_PROXY",
      ),
    ).toBe(true);
  });
});
