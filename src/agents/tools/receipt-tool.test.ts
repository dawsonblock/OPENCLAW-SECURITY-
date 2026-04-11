import { describe, expect, it } from "vitest";
import { createReceiptTool } from "./receipt-tool.js";

describe("receipt_generate tool", () => {
  it("generates a successful triage receipt", async () => {
    const tool = createReceiptTool();
    const result = await tool.execute("call1", {
      agentId: "triage",
      workflow: "Messaging Triage",
      status: "routed",
      summary: "Routed to coder for database fix",
      details: {
        "Target Agent": "coder",
        Session: "agent:coder:subagent:123",
      },
    });

    const details = result.details as Record<string, any>;
    expect(details.status).toBe("recorded");
    expect(details.receipt.agentId).toBe("triage");
    expect(details.markdown).toContain("### 🧩 Messaging Triage Receipt");
    expect(details.markdown).toContain("> **Status**: ROUTED");
    expect(details.markdown).toContain("| Target Agent | coder |");
    expect(details.markdown).toContain("| Session | agent:coder:subagent:123 |");
  });

  it("generates a failure coder receipt", async () => {
    const tool = createReceiptTool();
    const result = await tool.execute("call2", {
      agentId: "coder",
      workflow: "Bug Fix",
      status: "failure",
      summary: "Tests failed for the login fix",
      details: {
        "Tests Passed": "4/5",
        Error: "Timeout in database connection",
      },
    });

    const details = result.details as Record<string, any>;
    expect(details.markdown).toContain("### 🛠️ Bug Fix Receipt");
    expect(details.markdown).toContain("> [!CAUTION]");
    expect(details.markdown).toContain("> **Status**: FAILURE");
    expect(details.markdown).toContain("| Tests Passed | 4/5 |");
  });

  it("uses default emoji for unknown agentId", async () => {
    const tool = createReceiptTool();
    const result = await tool.execute("call3", {
      agentId: "unknown",
      workflow: "Generic Task",
      status: "success",
      summary: "Task finished",
    });

    const details = result.details as Record<string, any>;
    expect(details.markdown).toContain("### 📄 Generic Task Receipt");
  });
});
