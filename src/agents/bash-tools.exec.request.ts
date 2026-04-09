import crypto from "node:crypto";

export function buildWarningText(warnings: string[]): string {
  return warnings.length ? `${warnings.join("\n")}\n\n` : "";
}

export function buildNodeInvokeIdempotencyKey() {
  return crypto.randomUUID();
}
