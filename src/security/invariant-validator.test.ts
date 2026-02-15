import { describe, it, expect } from "vitest";
import type { OpenClawConfig } from "../../config/config.js";
import { validateStartupInvariants } from "./invariant-validator.js";

describe("validateStartupInvariants", () => {
  const cleanEnv = { NODE_ENV: "production" };
  const baseConfig: OpenClawConfig = {
    gateway: {
      nodes: {
        allowCommands: [],
      },
    },
  };

  it("should pass with clean environment and default config", () => {
    const result = validateStartupInvariants({ cfg: baseConfig, env: { ...cleanEnv } });
    expect(result.ok).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("should fail if break-glass flag is set in production", () => {
    const result = validateStartupInvariants({
      cfg: baseConfig,
      env: { ...cleanEnv, OPENCLAW_ALLOW_HOST_EXEC: "1" },
    });
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes("Break-glass flags detection"))).toBe(true);
  });

  it("should fail if sandbox network is not 'none' in production", () => {
    const result = validateStartupInvariants({
      cfg: baseConfig,
      env: { ...cleanEnv, OPENCLAW_SANDBOX_NETWORK: "host" },
    });
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes("Sandbox network must be 'none'"))).toBe(true);
  });

  it("should fail if dangerous commands are allowed in config", () => {
    const dangerousConfig: OpenClawConfig = {
      gateway: {
        nodes: {
          allowCommands: ["system.run"],
        },
      },
    };
    const result = validateStartupInvariants({ cfg: dangerousConfig, env: { ...cleanEnv } });
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes("Dangerous commands allowed"))).toBe(true);
  });

  it("should allow break-glass flags in development", () => {
    const devEnv = { NODE_ENV: "development", OPENCLAW_ALLOW_HOST_EXEC: "1" };
    const result = validateStartupInvariants({ cfg: baseConfig, env: devEnv });
    expect(result.ok).toBe(true);
  });
});
