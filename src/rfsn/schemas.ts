import type { RfsnActionProposal } from "./types.js";

function normalizeOptionalString(value: string | undefined): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed || undefined;
}

function normalizeCapabilities(value: string[] | undefined): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const normalized = [...new Set(value.map((cap) => cap.trim()).filter(Boolean))];
  return normalized.length > 0 ? normalized : undefined;
}

function isFiniteTimestamp(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

export function validateAndNormalizeActionProposal(
  proposal: RfsnActionProposal,
): { ok: true; proposal: RfsnActionProposal } | { ok: false; reasons: string[] } {
  const reasons: string[] = [];
  const id = normalizeOptionalString(proposal.id);
  const actor = normalizeOptionalString(proposal.actor);
  const toolName = normalizeOptionalString(proposal.toolName);
  const sessionId = normalizeOptionalString(proposal.sessionId);
  const sessionKey = normalizeOptionalString(proposal.sessionKey);
  const agentId = normalizeOptionalString(proposal.agentId);

  if (!id) {
    reasons.push("invalid:id");
  }
  if (!actor) {
    reasons.push("invalid:actor");
  }
  if (!toolName) {
    reasons.push("invalid:tool_name");
  }
  if (!isFiniteTimestamp(proposal.timestampMs)) {
    reasons.push("invalid:timestamp");
  }

  if (reasons.length > 0) {
    return { ok: false, reasons };
  }

  return {
    ok: true,
    proposal: {
      ...proposal,
      id: id as string,
      actor: actor as string,
      toolName: toolName as string,
      sessionId,
      sessionKey,
      agentId,
      capabilitiesRequired: normalizeCapabilities(proposal.capabilitiesRequired),
    },
  };
}
