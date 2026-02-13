import { describe, expect, it } from "vitest";
import {
  isSafeModeEnabled,
  resolveStartupBindOverride,
  validateGatewayStartupSecurity,
} from "./startup-validator.js";

describe("startup-validator", () => {
  it("forces loopback bind when safe mode is enabled", () => {
    const resolved = resolveStartupBindOverride({
      bind: "lan",
      host: "0.0.0.0",
      env: {
        OPENCLAW_SAFE_MODE: "1",
      } as NodeJS.ProcessEnv,
    });
    expect(resolved).toEqual({ bind: "loopback", host: undefined });
  });

  it("detects unsafe exposed startup combinations", () => {
    const issues = validateGatewayStartupSecurity({
      cfg: {
        gateway: {
          nodes: {
            allowCommands: ["system.run"],
          },
          controlUi: {
            allowInsecureAuth: true,
          },
        },
      },
      bindHost: "0.0.0.0",
      tailscaleMode: "off",
      env: {
        OPENCLAW_ALLOW_BROWSER_PROXY: "1",
      } as NodeJS.ProcessEnv,
    });
    expect(issues).toEqual(
      expect.arrayContaining([
        expect.stringContaining("dangerous node commands enabled"),
        expect.stringContaining("allowInsecureAuth"),
        expect.stringContaining("OPENCLAW_ALLOW_BROWSER_PROXY=1"),
      ]),
    );
  });

  it("does not flag loopback exposure", () => {
    const issues = validateGatewayStartupSecurity({
      cfg: {
        gateway: {
          nodes: {
            allowCommands: ["system.run"],
          },
        },
      },
      bindHost: "127.0.0.1",
      tailscaleMode: "off",
      env: {} as NodeJS.ProcessEnv,
    });
    expect(issues).toEqual([]);
  });

  it("reads safe mode env toggles", () => {
    expect(isSafeModeEnabled({ OPENCLAW_SAFE_MODE: "1" } as NodeJS.ProcessEnv)).toBe(true);
    expect(isSafeModeEnabled({ OPENCLAW_SAFE_MODE: "true" } as NodeJS.ProcessEnv)).toBe(true);
    expect(isSafeModeEnabled({ OPENCLAW_SAFE_MODE: "0" } as NodeJS.ProcessEnv)).toBe(false);
  });
});
