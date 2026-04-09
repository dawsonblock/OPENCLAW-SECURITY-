import { describe, expect, it } from "vitest";
import {
  computeCapabilityApprovalBindHash,
  computeNodeInvokeApprovalPayloadHash,
} from "./capability-approval.js";

describe("capability-approval", () => {
  it("bind hash changes with session identity", () => {
    const base = {
      capability: "node.browser.proxy",
      subject: "node-1",
      payloadHash: "abc",
    };
    const withSession = computeCapabilityApprovalBindHash({
      ...base,
      sessionKey: "agent:session:1",
    });
    const otherSession = computeCapabilityApprovalBindHash({
      ...base,
      sessionKey: "agent:session:2",
    });
    expect(withSession).not.toBe(otherSession);
  });

  it("normalizes payload hash by removing approval tokens", () => {
    const a = computeNodeInvokeApprovalPayloadHash({
      nodeId: "node-1",
      command: "browser.proxy",
      payload: {
        method: "GET",
        path: "/tabs",
      },
    });
    const b = computeNodeInvokeApprovalPayloadHash({
      nodeId: "node-1",
      command: "browser.proxy",
      payload: {
        method: "GET",
        path: "/tabs",
        capabilityApprovalToken: "token-a",
      },
    });
    expect(a).toBe(b);
  });
});
