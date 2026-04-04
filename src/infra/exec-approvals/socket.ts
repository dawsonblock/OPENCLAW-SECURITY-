import crypto from "node:crypto";
import net from "node:net";
import type { ExecApprovalDecision } from "./types.js";

export async function requestExecApprovalViaSocket(params: {
  socketPath: string;
  token: string;
  request: Record<string, unknown>;
  timeoutMs?: number;
}): Promise<ExecApprovalDecision | null> {
  const { socketPath, token, request } = params;
  if (!socketPath || !token) {
    return null;
  }
  const timeoutMs = params.timeoutMs ?? 15_000;
  return await new Promise((resolve) => {
    const client = new net.Socket();
    let settled = false;
    let buffer = "";
    let timer: NodeJS.Timeout | undefined;
    const finish = (value: ExecApprovalDecision | null) => {
      if (settled) {
        return;
      }
      settled = true;
      if (timer) {
        clearTimeout(timer);
        timer = undefined;
      }
      try {
        client.destroy();
      } catch {
        // ignore
      }
      resolve(value);
    };

    timer = setTimeout(() => finish(null), timeoutMs);
    const payload = JSON.stringify({
      type: "request",
      token,
      id: crypto.randomUUID(),
      request,
    });

    client.on("error", () => finish(null));
    client.connect(socketPath, () => {
      client.write(`${payload}\n`);
    });
    client.on("data", (data) => {
      buffer += data.toString("utf8");
      let idx = buffer.indexOf("\n");
      while (idx !== -1) {
        const line = buffer.slice(0, idx).trim();
        buffer = buffer.slice(idx + 1);
        idx = buffer.indexOf("\n");
        if (!line) {
          continue;
        }
        try {
          const msg = JSON.parse(line) as { type?: string; decision?: ExecApprovalDecision };
          if (msg?.type === "decision" && msg.decision) {
            finish(msg.decision);
            return;
          }
        } catch {
          // ignore
        }
      }
    });
  });
}
