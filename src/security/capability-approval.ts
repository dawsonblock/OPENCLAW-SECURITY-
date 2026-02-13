import { hashPayload } from "./stable-hash.js";

export type CapabilityApprovalBind = {
  capability: string;
  subject: string;
  payloadHash: string;
  agentId?: string | null;
  sessionKey?: string | null;
};

function normalizeForPayloadHash(value: unknown, seen: WeakSet<object> = new WeakSet()): unknown {
  if (value === null || value === undefined) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((entry) => normalizeForPayloadHash(entry, seen));
  }
  if (typeof value !== "object") {
    return value;
  }
  if (seen.has(value)) {
    return "[Circular]";
  }
  seen.add(value);
  const out: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (key === "approvalToken" || key === "capabilityApprovalToken") {
      continue;
    }
    out[key] = normalizeForPayloadHash(entry, seen);
  }
  return out;
}

export function computeNodeInvokeApprovalPayloadHash(params: {
  nodeId: string;
  command: string;
  payload: unknown;
}): string {
  return hashPayload({
    nodeId: params.nodeId,
    command: params.command,
    params: normalizeForPayloadHash(params.payload),
  });
}

export function computeCapabilityApprovalBindHash(bind: CapabilityApprovalBind): string {
  return hashPayload({
    v: 1,
    capability: bind.capability,
    subject: bind.subject,
    payloadHash: bind.payloadHash,
    agentId: bind.agentId ?? null,
    sessionKey: bind.sessionKey ?? null,
  });
}
