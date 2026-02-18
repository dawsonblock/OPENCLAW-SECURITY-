import { describe, it, expect } from "vitest";
import { analyzeShellCommand } from "../infra/exec-approvals.js";
import { rfsnDispatch } from "../rfsn/dispatch.js";
import { createDefaultRfsnPolicy } from "../rfsn/policy.js";
import { runAllowedCommand } from "./subprocess.js";

// Mock tool for testing
const mockTool = {
  name: "exec",
  execute: async (_id: string, args: any) => {
    return { content: [{ text: "executed" }] };
  },
} as any;

describe("Red Team Security Simulation", () => {
  const policy = createDefaultRfsnPolicy();
  const workspaceDir = "/tmp/sandbox";
  const meta = { actor: "red-team" };

  describe("Attack Vector 1: Command Injection", () => {
    it("should block command chaining (;)", async () => {
      const result = analyzeShellCommand({ command: "ls; echo pwned" });
      expect(result.ok).toBe(true); // Parser is ok
      // But RFSN policy should block it or subprocess should fail validation if passed raw

      // Let's test the subprocess spawner directly with injection
      await expect(
        runAllowedCommand({
          command: "ls; echo pwned",
          args: [],
          allowedBins: ["ls"],
        }),
      ).rejects.toThrow(/Blocked executable/);
    });

    it("should block command substitution $(...)", async () => {
      await expect(
        runAllowedCommand({
          command: "$(echo pwned)",
          args: [],
          allowedBins: ["ls"],
        }),
      ).rejects.toThrow(/Blocked executable/);
    });
  });

  describe("Attack Vector 2: Path Traversal", () => {
    it("should block absolute paths in command execution", async () => {
      await expect(
        runAllowedCommand({
          command: "/bin/sh",
          args: ["-c", "echo pwned"],
          allowedBins: ["sh"],
        }),
      ).rejects.toThrow(/Blocked executable path/);
    });

    it("should block directory traversal in command path", async () => {
      // The analyzer might parse it, but the spawner must block it
      await expect(
        runAllowedCommand({
          command: "../../bin/sh",
          args: [],
          allowedBins: ["sh"],
        }),
      ).rejects.toThrow();
    });
  });

  describe("Attack Vector 3: RFSN Bypass Attempt", () => {
    it("should reject tool execution without capability grant (or sandbox)", async () => {
      // "exec" requires "proc:manage" AND "requireSandbox: true"

      // We use a restrictive policy
      const restrictivePolicy = createDefaultRfsnPolicy({
        grantedCapabilities: [], // No caps
      });

      await expect(
        rfsnDispatch({
          tool: mockTool,
          toolCallId: "call-1",
          args: { command: "ls" },
          workspaceDir,
          policy: restrictivePolicy,
          meta,
        }),
      ).rejects.toThrow(/policy:(sandbox_required|.*capability_missing)/);
    });
  });

  describe("Attack Vector 4: Environment Scrubbing", () => {
    it("should not leak secrets into subprocess env", async () => {
      process.env.SECRET_TOKEN = "super-secret";
      process.env.NODE_OPTIONS = "--require malicious"; // Dangerous!

      const result = await runAllowedCommand({
        command: "env", // Assuming env is allowed or we add it
        args: [],
        allowedBins: ["env"],
        envOverrides: { TEST_VAR: "safe" },
      });

      expect(result.stdout).not.toContain("super-secret");
      expect(result.stdout).not.toContain("malicious");
      expect(result.stdout).toContain("safe");

      delete process.env.SECRET_TOKEN;
      delete process.env.NODE_OPTIONS;
    });
  });
});
