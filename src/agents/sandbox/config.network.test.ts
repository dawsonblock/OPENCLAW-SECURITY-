/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it, afterEach } from "vitest";
import { resolveSandboxConfigForAgent } from "./config.js";

describe("Sandbox Network Policy", () => {
  const originalEnv = process.env;

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("defaults to 'none' when no network config is provided", () => {
    const config = resolveSandboxConfigForAgent({});
    expect(config.docker.network).toBe("none");
  });

  it("allows overriding network in non-production environment", () => {
    process.env.NODE_ENV = "development";
    const config = resolveSandboxConfigForAgent({
      agents: {
        defaults: {
          sandbox: {
            docker: { network: "host" } as any,
          },
        },
      },
    });
    expect(config.docker.network).toBe("host");
  });

  it("throws in production if network is not 'none'", () => {
    process.env.NODE_ENV = "production";

    expect(() => {
      resolveSandboxConfigForAgent({
        agents: {
          defaults: {
            sandbox: {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              docker: { network: "host" } as any,
            },
          },
        },
      });
    }).toThrow(/Security Violation: Sandbox network must be 'none' in production/);
  });

  it("allows network in production if break-glass env var is set", () => {
    process.env.NODE_ENV = "production";
    process.env.OPENCLAW_ALLOW_NETWORK = "1";

    const config = resolveSandboxConfigForAgent({
      agents: {
        defaults: {
          sandbox: {
            docker: { network: "host" } as any,
          },
        },
      },
    });
    expect(config.docker.network).toBe("host");
  });

  it("respects agent-specific overrides (dev mode)", () => {
    process.env.NODE_ENV = "development";
    const config = resolveSandboxConfigForAgent(
      {
        agents: {
          defaults: {
            sandbox: { docker: { network: "none" } as any },
          },
          list: [
            {
              id: "test-agent",
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              sandbox: { docker: { network: "bridge" } as any },
            },
          ],
        },
      },
      "test-agent",
    );

    expect(config.docker.network).toBe("bridge");
  });
});
