import {
  ensureExecApprovals,
  normalizeExecApprovals,
  readExecApprovalsSnapshot,
  resolveExecApprovalsSocketPath,
  saveExecApprovals,
  type ExecApprovalsFile,
} from "../../infra/exec-approvals.js";
import type { GatewayClient } from "../../gateway/client.js";
import { decodeParams, sendInvokeResult } from "../events.js";
import { redactExecApprovals, requireExecApprovalsBaseHash } from "../exec-utils.js";
import type {
  ExecApprovalsSnapshot,
  NodeInvokeRequestPayload,
  SystemExecApprovalsSetParams,
} from "../types.js";

export async function handleSystemExecApprovalsGet(
  client: GatewayClient,
  frame: NodeInvokeRequestPayload,
) {
  try {
    ensureExecApprovals();
    const snapshot = readExecApprovalsSnapshot();
    const payload: ExecApprovalsSnapshot = {
      path: snapshot.path,
      exists: snapshot.exists,
      hash: snapshot.hash,
      file: redactExecApprovals(snapshot.file),
    };
    await sendInvokeResult(client, frame, {
      ok: true,
      payloadJSON: JSON.stringify(payload),
    });
  } catch (err) {
    const message = String(err);
    const code = message.toLowerCase().includes("timed out") ? "TIMEOUT" : "INVALID_REQUEST";
    await sendInvokeResult(client, frame, {
      ok: false,
      error: { code, message },
    });
  }
}

export async function handleSystemExecApprovalsSet(
  client: GatewayClient,
  frame: NodeInvokeRequestPayload,
) {
  try {
    const params = decodeParams<SystemExecApprovalsSetParams>(frame.paramsJSON);
    if (!params.file || typeof params.file !== "object") {
      throw new Error("INVALID_REQUEST: exec approvals file required");
    }
    ensureExecApprovals();
    const snapshot = readExecApprovalsSnapshot();
    requireExecApprovalsBaseHash(params, snapshot);
    const normalized = normalizeExecApprovals(params.file);
    const currentSocketPath = snapshot.file.socket?.path?.trim();
    const currentToken = snapshot.file.socket?.token?.trim();
    const socketPath =
      normalized.socket?.path?.trim() ?? currentSocketPath ?? resolveExecApprovalsSocketPath();
    const token = normalized.socket?.token?.trim() ?? currentToken ?? "";
    const next: ExecApprovalsFile = {
      ...normalized,
      socket: {
        path: socketPath,
        token,
      },
    };
    saveExecApprovals(next);
    const nextSnapshot = readExecApprovalsSnapshot();
    const payload: ExecApprovalsSnapshot = {
      path: nextSnapshot.path,
      exists: nextSnapshot.exists,
      hash: nextSnapshot.hash,
      file: redactExecApprovals(nextSnapshot.file),
    };
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
