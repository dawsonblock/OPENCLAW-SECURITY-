import os from "node:os";
import { spawnSyncAllowed } from "../process/exec.js";

export type OsSummary = {
  platform: NodeJS.Platform;
  arch: string;
  release: string;
  label: string;
};

function safeTrim(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function macosVersion(): string {
  const res = spawnSyncAllowed({
    command: "sw_vers",
    args: ["-productVersion"],
    allowedBins: ["sw_vers"],
    encoding: "utf-8",
  });
  const out = safeTrim(res.stdout);
  return out || os.release();
}

export function resolveOsSummary(): OsSummary {
  const platform = os.platform();
  const release = os.release();
  const arch = os.arch();
  const label = (() => {
    if (platform === "darwin") {
      return `macos ${macosVersion()} (${arch})`;
    }
    if (platform === "win32") {
      return `windows ${release} (${arch})`;
    }
    return `${platform} ${release} (${arch})`;
  })();
  return { platform, arch, release, label };
}
