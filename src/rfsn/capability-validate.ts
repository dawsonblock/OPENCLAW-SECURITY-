import type { RfsnCapability } from "./types.js";

function normalizeCapability(capability: string): string {
  return capability.trim().toLowerCase();
}

export function validateCapabilities(grantedCapabilities: Iterable<RfsnCapability>): void {
  const granted = new Set(
    [...grantedCapabilities]
      .map((capability) => normalizeCapability(String(capability)))
      .filter(Boolean),
  );

  if (granted.has("browser:unsafe_eval") && !granted.has("net:browser")) {
    throw new Error("invalid_capability_combo:browser_unsafe_eval_requires_net_browser");
  }

  if (granted.has("exec:host")) {
    throw new Error("invalid_capability_combo:exec_host_forbidden");
  }
}
