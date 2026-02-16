import type { RuntimeEnv } from "../../../runtime.js";
import type { OnboardOptions } from "../../onboard-types.js";

export function logNonInteractiveOnboardingJson(params: {
  opts: OnboardOptions;
  runtime: RuntimeEnv;
  mode: string;
  workspaceDir: string;
  authChoice: string;
  gateway: {
    port: number;
    bind: string;
    authMode: string;
    tailscaleMode: string;
  };
  installDaemon: boolean;
  daemonRuntime?: string;
  skipSkills: boolean;
  skipHealth: boolean;
}): void {
  if (params.opts.json) {
    params.runtime.log(JSON.stringify(params, null, 2));
  }
}
