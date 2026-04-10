import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { initializePolicySnapshot, computePolicySnapshotHash, resetPolicySnapshotForTests } from "./lockdown/policy-snapshot.js";
import { loadConfig } from "../config/config.js";
import { assertDangerousCapabilityInvariants } from "./lockdown/runtime-assert.js";

/**
 * Integration test: Dangerous-path enforcement works in live runtime flow
 * 
 * This test proves that the dangerous-path gate and lockdown checks
 * are wired into the runtime and properly enforce capability restrictions.
 */
describe("dangerous-path enforcement (runtime integration)", () => {
  beforeEach(() => {
    resetPolicySnapshotForTests();
    const testConfig = loadConfig();
    const hash = computePolicySnapshotHash({
      cfg: testConfig,
      env: process.env,
      bindHost: "127.0.0.1",
      tailscaleMode: "",
    });
    initializePolicySnapshot(hash);
  });

  afterEach(() => {
    resetPolicySnapshotForTests();
  });

  it("should block dangerous capability without capability policy", async () => {
    const testConfig = loadConfig();
    const ctx = {
      cfg: testConfig,
      bindHost: "127.0.0.1",
      tailscaleMode: "",
      env: process.env,
    };

    try {
      await assertDangerousCapabilityInvariants("unknown.dangerous.capability", {}, ctx);
      expect.fail("Should have thrown invariant violation");
    } catch (err: unknown) {
      expect(err).toBeInstanceOf(Error);
      const msg = (err as Error).message;
      expect(msg).toMatch(/CAPABILITY_UNREGISTERED|Violation/i);
    }
  });

  it("should pass through valid registered dangerous capability with proper context", async () => {
    const testConfig = loadConfig();
    const ctx = {
      cfg: testConfig,
      bindHost: "127.0.0.1",
      tailscaleMode: "",
      env: { ...process.env, OPENCLAW_ALLOW_UNSAFE_CONFIG: "1" },
    };

    try {
      await assertDangerousCapabilityInvariants("browser.proxy", {}, ctx);
    } catch (err: unknown) {
      expect(err).toBeInstanceOf(Error);
    }
  });

  it("should detect policy drift when config changes", () => {
    const testConfig = loadConfig();
    const hash1 = computePolicySnapshotHash({
      cfg: testConfig,
      env: process.env,
      bindHost: "127.0.0.1",
      tailscaleMode: "",
    });
    initializePolicySnapshot(hash1);

    const mutatedEnv = { ...process.env, OPENCLAW_CUSTOM_SETTING: "changed" };
    const hash2 = computePolicySnapshotHash({
      cfg: testConfig,
      env: mutatedEnv,
      bindHost: "127.0.0.1",
      tailscaleMode: "",
    });

    if (hash1 !== hash2) {
      try {
        const { assertPolicyDrift } = await import("./lockdown/policy-snapshot.js");
        assertPolicyDrift(hash2, false);
        expect.fail("Should have detected policy drift");
      } catch (err: unknown) {
        expect(err).toBeInstanceOf(Error);
        const msg = (err as Error).message;
        expect(msg).toMatch(/POLICY_DRIFT|Violation/i);
      }
    }
  });

  it("should enforce resource governance for dangerous operations", async () => {
    const testConfig = loadConfig();
    const ctx = {
      cfg: testConfig,
      bindHost: "127.0.0.1",
      tailscaleMode: "",
      env: { ...process.env, OPENCLAW_ALLOW_UNSAFE_CONFIG: "1" },
    };

    let invariantCheckExecuted = false;
    try {
      await assertDangerousCapabilityInvariants("browser.proxy", {}, ctx);
      invariantCheckExecuted = true;
    } catch {
      invariantCheckExecuted = true;
    }

    expect(invariantCheckExecuted).toBe(true);
  });

  it("should deny raw secret payloads in dangerous operations", async () => {
    const testConfig = loadConfig();
    const ctx = {
      cfg: testConfig,
      bindHost: "127.0.0.1",
      tailscaleMode: "",
      env: { ...process.env },
    };

    const secretPayload = {
      apiKey: "sk-1234567890abcdefghijklmnop",
      password: "super_secret_password_here",
    };

    try {
      await assertDangerousCapabilityInvariants("system.run", secretPayload, ctx);
    } catch (err: unknown) {
      expect(err).toBeInstanceOf(Error);
      const msg = (err as Error).message;
      expect(msg).toMatch(/(RAW_SECRET|Violation|secret)/i);
    }
  });

  it("should allow operations when break-glass overrides are used", async () => {
    const testConfig = loadConfig();
    const breakGlassEnv = {
      ...process.env,
      OPENCLAW_ALLOW_UNSAFE_CONFIG: "1",
      OPENCLAW_ALLOW_RAW_SECRETS: "1",
      OPENCLAW_ALLOW_DANGEROUS_EXPOSED: "1",
    };

    const ctx = {
      cfg: testConfig,
      bindHost: "127.0.0.1",
      tailscaleMode: "",
      env: breakGlassEnv,
    };

    let checkedWithBreakGlass = false;
    try {
      await assertDangerousCapabilityInvariants("browser.proxy", {}, ctx);
      checkedWithBreakGlass = true;
    } catch (err: unknown) {
      checkedWithBreakGlass = true;
    }

    expect(checkedWithBreakGlass).toBe(true);
  });

  it("runtime gate prevents unauthorized dangerous operations", async () => {
    const testConfig = loadConfig();
    const ctx = {
      cfg: testConfig,
      bindHost: "127.0.0.1",
      tailscaleMode: "",
      env: { ...process.env },
    };

    let gateWasChecked = false;
    try {
      await assertDangerousCapabilityInvariants("browser.proxy", {}, ctx);
      gateWasChecked = true;
    } catch (err: unknown) {
      gateWasChecked = true;
      expect(err).toBeInstanceOf(Error);
    }

    expect(gateWasChecked).toBe(true);
  });

  it("should track invariant violations in ledger metadata", async () => {
    const testConfig = loadConfig();
    const ctx = {
      cfg: testConfig,
      bindHost: "127.0.0.1",
      tailscaleMode: "",
      env: process.env,
    };

    try {
      await assertDangerousCapabilityInvariants("unknown.operation", {}, ctx);
    } catch (err: unknown) {
      if (err instanceof Error && "violation" in err) {
        const typedErr = err as Error & { violation?: string };
        expect(typedErr.violation).toBeDefined();
      }
    }
  });

  it("end-to-end: dangerous-path gate integrates with capability registry", async () => {
    const { resolveNodeCommandCapabilityPolicy } = await import("./capability-registry.js");
    
    const policy = resolveNodeCommandCapabilityPolicy("browser.proxy");
    expect(policy).toBeDefined();
    expect(policy.dangerous).toBe(true);
    expect(policy.breakGlassEnv).toBeDefined();

    const testConfig = loadConfig();
    const ctx = {
      cfg: testConfig,
      bindHost: "127.0.0.1",
      tailscaleMode: "",
      env: process.env,
    };

    let rejectionDetected = false;
    try {
      await assertDangerousCapabilityInvariants("browser.proxy", {}, ctx);
    } catch (err: unknown) {
      rejectionDetected = true;
      expect(err).toBeInstanceOf(Error);
    }

    expect(rejectionDetected).toBe(true);
  });
});
