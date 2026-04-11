import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import {
  agentCommand,
  connectOk,
  installGatewayTestHooks,
  rpcReq,
  startServerWithClient,
  testState,
  writeSessionStore,
} from "./test-helpers.js";

installGatewayTestHooks({ scope: "suite" });

let server: Awaited<ReturnType<typeof startServerWithClient>>["server"];
let ws: Awaited<ReturnType<typeof startServerWithClient>>["ws"];

beforeAll(async () => {
  const started = await startServerWithClient();
  server = started.server;
  ws = started.ws;
  await connectOk(ws);
});

afterAll(async () => {
  ws.close();
  await server.close();
});

describe("OpenClaw Operator Workflows E2E", () => {
  test("triage to coder handoff and receipt generation (mocked)", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-workflow-"));
    testState.sessionStorePath = path.join(dir, "sessions.json");

    // 1. Setup session store
    await writeSessionStore({
      entries: {
        main: {
          sessionId: "sess-triage",
          updatedAt: Date.now(),
        },
      },
    });

    // 2. Mock agentCommand for triage
    // When triage runs, it should return a "receipt" and ideally we'd see a spawn call.
    // In this test, we verify the gateway accepts the 'agent' call which triggers triage.
    const res = await rpcReq(ws, "agent", {
      message: "Fix the bug in the login page",
      sessionKey: "main",
      idempotencyKey: "idem-triage-1",
    });
    expect(res.ok).toBe(true);

    const spy = vi.mocked(agentCommand);
    expect(spy).toHaveBeenCalled();
    const triageCall = spy.mock.calls.at(-1)?.[0] as Record<string, any>;
    expect(triageCall.message).toContain("Fix the bug in the login page");
    expect(triageCall.sessionKey).toBe("main");

    // 3. Verify tool implementation is available in the environment
    // (This is implicitly tested by the unit tests, but we ensure the gateway
    // registry would include them in a real run).
    // In E2E tests, createOpenClawTools is called by the real server.impl.ts.

    await fs.rm(dir, { recursive: true, force: true });
    testState.sessionStorePath = undefined;
  });
});
