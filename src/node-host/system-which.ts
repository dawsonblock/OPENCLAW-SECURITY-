import { resolveExecutable } from "./env.js";
import type { SystemWhichParams } from "./types.js";

export async function handleSystemWhich(params: SystemWhichParams, env?: Record<string, string>) {
  const bins = params.bins.map((bin) => bin.trim()).filter(Boolean);
  const found: Record<string, string> = {};
  for (const bin of bins) {
    const resolved = resolveExecutable(bin, env);
    if (resolved) {
      found[bin] = resolved;
    }
  }
  return { bins: found };
}
