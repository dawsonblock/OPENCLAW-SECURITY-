import { describe, expect, it } from "vitest";
import { ExecApprovalManager, type ExecApprovalRequestPayload } from "./exec-approval-manager.js";

describe("ExecApprovalManager token binding", () => {
  const request: ExecApprovalRequestPayload = {
    command: "echo hello",
    commandArgv: ["echo", "hello"],
    commandEnv: { LANG: "C" },
    cwd: "/tmp",
    host: "node",
    security: "allowlist",
    ask: "on-miss",
    agentId: "agent-main",
    resolvedPath: "/bin/echo",
    sessionKey: "agent:main:test",
  };

  it("issues one-time approval tokens bound to request payload", () => {
    const manager = new ExecApprovalManager();
    const bindHash = manager.computeBindHash(request);
    const token = manager.issueToken(bindHash);

    expect(manager.consumeToken(token, bindHash)).toBe(true);
    expect(manager.consumeToken(token, bindHash)).toBe(false);
  });

  it("rejects token use when bind hash does not match", () => {
    const manager = new ExecApprovalManager();
    const bindHash = manager.computeBindHash(request);
    const wrongBindHash = manager.computeBindHash({
      ...request,
      command: "echo goodbye",
    });
    const token = manager.issueToken(bindHash);

    expect(manager.consumeToken(token, wrongBindHash)).toBe(false);
  });

  it("binds token to argv and env payload", () => {
    const manager = new ExecApprovalManager();
    const bindHash = manager.computeBindHash(request);
    const token = manager.issueToken(bindHash);
    const differentEnvHash = manager.computeBindHash({
      ...request,
      commandEnv: { LANG: "en_US.UTF-8" },
    });

    expect(manager.consumeToken(token, differentEnvHash)).toBe(false);
  });
});
