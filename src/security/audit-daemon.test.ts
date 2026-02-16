import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import type { OpenClawConfig } from "../config/config.js";
import { AuditDaemon, type AuditLogger } from "./audit-daemon.js";

describe("Audit Daemon", () => {
  let mockConfig: OpenClawConfig;
  let logger: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    mockConfig = {
      security: { model: { providerAllowlist: ["a"] } },
      agents: {
        defaults: {
          sandbox: {
            fs: { allow: ["/"] },
            docker: { network: "none" },
            executionBudget: { timeoutMs: 100 },
          },
        },
      },
    };
    logger = vi.fn() as unknown as AuditLogger;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("establishes baseline on start", () => {
    const daemon = new AuditDaemon(() => mockConfig, logger);
    daemon.start();

    expect(logger).toHaveBeenCalledWith("info", expect.stringMatching(/Audit Daemon started/));
    expect(daemon.getBaseline()).toBeDefined();
  });

  it("detects modification (drift)", () => {
    const daemon = new AuditDaemon(() => mockConfig, logger);
    daemon.start(1000);

    // Mutate config
    mockConfig.security!.model!.providerAllowlist!.push("b");

    // Fast forward
    vi.advanceTimersByTime(1100);

    expect(logger).toHaveBeenCalledWith("critical", expect.stringMatching(/SECURITY VIOLATION/));
  });

  it("stays silent when consistent", () => {
    const daemon = new AuditDaemon(() => mockConfig, logger);
    daemon.start(1000);

    vi.advanceTimersByTime(5000);

    // Should start info, but no criticals
    expect(logger).not.toHaveBeenCalledWith("critical", expect.anything());
  });
});
