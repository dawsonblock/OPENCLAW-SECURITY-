import type { OpenClawConfig } from "../../../config/config.js";
import type { RuntimeEnv } from "../../../runtime.js";
import type { OnboardOptions } from "../../onboard-types.js";

export async function installGatewayDaemonNonInteractive(_params: {
  nextConfig: OpenClawConfig;
  opts: OnboardOptions;
  runtime: RuntimeEnv;
  port: number;
  gatewayToken: string;
}): Promise<void> {
  // Stub implementation
}
