import { afterEach, describe, expect, it, vi } from "vitest";
import { execApprovalsHandlers } from "./exec-approvals.js";

const noop = () => {};

describe("exec approvals policy mutation gate", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("blocks local exec approvals set unless break-glass flag is enabled", async () => {
    vi.stubEnv("OPENCLAW_ALLOW_POLICY_MUTATION", "0");
    const respond = vi.fn();

    await execApprovalsHandlers["exec.approvals.set"]({
      params: { file: { version: 1 } },
      respond,
      context: {} as Parameters<(typeof execApprovalsHandlers)["exec.approvals.set"]>[0]["context"],
      client: null,
      req: { id: "req-1", type: "req", method: "exec.approvals.set" },
      isWebchatConnect: noop,
    });

    expect(respond).toHaveBeenCalledWith(
      false,
      undefined,
      expect.objectContaining({
        message: "policy mutation is disabled; set OPENCLAW_ALLOW_POLICY_MUTATION=1",
      }),
    );
  });

  it("blocks node exec approvals set unless break-glass flag is enabled", async () => {
    vi.stubEnv("OPENCLAW_ALLOW_POLICY_MUTATION", "0");
    const respond = vi.fn();

    await execApprovalsHandlers["exec.approvals.node.set"]({
      params: {
        nodeId: "node-1",
        file: { version: 1 },
      },
      respond,
      context: {} as Parameters<
        (typeof execApprovalsHandlers)["exec.approvals.node.set"]
      >[0]["context"],
      client: null,
      req: { id: "req-2", type: "req", method: "exec.approvals.node.set" },
      isWebchatConnect: noop,
    });

    expect(respond).toHaveBeenCalledWith(
      false,
      undefined,
      expect.objectContaining({
        message: "policy mutation is disabled; set OPENCLAW_ALLOW_POLICY_MUTATION=1",
      }),
    );
  });
});
