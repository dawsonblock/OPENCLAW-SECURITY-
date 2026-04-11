import { Type } from "@sinclair/typebox";
import type { AnyAgentTool } from "./common.js";
import { jsonResult, readStringParam } from "./common.js";

const ReceiptToolSchema = Type.Object({
  agentId: Type.String({
    description: "The ID of the agent generating the receipt (e.g., triage, coder, admin).",
  }),
  workflow: Type.String({ description: "The name of the workflow being completed." }),
  status: Type.String({ description: "The outcome status (success, failure, routed, partial)." }),
  summary: Type.String({
    description: "A high-level human-readable summary of what was accomplished.",
  }),
  details: Type.Optional(
    Type.Record(Type.String(), Type.Any(), {
      description: "Additional machine-readable metrics or results.",
    }),
  ),
});

export function createReceiptTool(): AnyAgentTool {
  return {
    label: "Receipt",
    name: "receipt_generate",
    description:
      "Generate a structured operator receipt to summarize the outcome of a workflow or task.",
    parameters: ReceiptToolSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const agentId = readStringParam(params, "agentId", { required: true });
      const workflow = readStringParam(params, "workflow", { required: true });
      const status = readStringParam(params, "status", { required: true });
      const summary = readStringParam(params, "summary", { required: true });
      const details = params.details as Record<string, unknown> | undefined;

      const emojiMap: Record<string, string> = {
        triage: "🧩",
        coder: "🛠️",
        admin: "🛡️",
        researcher: "🔍",
      };

      const emoji = emojiMap[agentId.toLowerCase()] ?? "📄";
      const alertType = status.toLowerCase() === "failure" ? "CAUTION" : "IMPORTANT";

      let detailsMarkdown = "";
      if (details && Object.keys(details).length > 0) {
        detailsMarkdown = "\n\n| Metric | Value |\n| :--- | :--- |\n";
        for (const [key, value] of Object.entries(details)) {
          detailsMarkdown += `| ${key} | ${value} |\n`;
        }
      }

      const markdown = `
### ${emoji} ${workflow} Receipt
> [!${alertType}]
> **Status**: ${status.toUpperCase()}
> **Agent**: \`${agentId}\`
> **Summary**: ${summary}${detailsMarkdown}
`;

      return jsonResult({
        status: "recorded",
        receipt: {
          agentId,
          workflow,
          status,
          summary,
          details,
          timestamp: new Date().toISOString(),
        },
        markdown: markdown.trim(),
      });
    },
  };
}
