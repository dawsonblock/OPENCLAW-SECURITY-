import type { OpenClawConfig } from "../../../config/config.js";
import type { RuntimeEnv } from "../../../runtime.js";
import type { OnboardOptions } from "../../onboard-types.js";

export async function applyNonInteractiveAuthChoice(params: {
  nextConfig: OpenClawConfig;
  authChoice: string;
  opts: OnboardOptions;
  runtime: RuntimeEnv;
  baseConfig: OpenClawConfig;
}): Promise<OpenClawConfig | undefined> {
  // Stub implementation
  return params.nextConfig;
}
