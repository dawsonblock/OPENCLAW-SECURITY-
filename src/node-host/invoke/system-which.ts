import type { GatewayClient } from "../../gateway/client.js";
import { sanitizeEnv } from "../env.js";
import { decodeParams, sendInvokeResult } from "../events.js";
import { handleSystemWhich as performSystemWhich } from "../system-which.js";
import type { NodeInvokeRequestPayload, SystemWhichParams } from "../types.js";

export async function handleSystemWhich(client: GatewayClient, frame: NodeInvokeRequestPayload) {
  try {
    const params = decodeParams<SystemWhichParams>(frame.paramsJSON);
    if (!Array.isArray(params.bins)) {
      throw new Error("INVALID_REQUEST: bins required");
    }
    const env = sanitizeEnv(undefined);
    const payload = await performSystemWhich(params, env);
    await sendInvokeResult(client, frame, {
      ok: true,
      payloadJSON: JSON.stringify(payload),
    });
  } catch (err) {
    await sendInvokeResult(client, frame, {
      ok: false,
      error: { code: "INVALID_REQUEST", message: String(err) },
    });
  }
}
