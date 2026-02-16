import { loadConfig } from "../config/config.js";
import { resolveGatewayBindHost } from "../gateway/net.js";
import { getPolicySnapshotHash } from "../security/lockdown/policy-snapshot.js";
import { extractSecurityPosture } from "../security/lockdown/posture.js";
import { getResourceUsage } from "../security/lockdown/resource-governor.js";
import { hashPayload } from "../security/stable-hash.js";

type SecurityDoctorOptions = {
  json?: boolean;
  verbose?: boolean;
};

export async function securityDoctorCommand(opts: SecurityDoctorOptions) {
  const cfg = loadConfig();
  const env = process.env;
  const bindHost = await resolveGatewayBindHost(cfg.gateway?.bind, cfg.gateway?.customBindHost);
  const tailscaleMode = String(cfg.gateway?.tailscale?.mode ?? "");

  const posture = extractSecurityPosture(cfg, env, bindHost, tailscaleMode);
  const currentHash = hashPayload(posture);
  const baselineHash = getPolicySnapshotHash();

  // We update the posture object with computed hash for display
  posture.policyHash = currentHash;

  const drift = baselineHash !== null && baselineHash !== currentHash;
  const resources = getResourceUsage();

  const report = {
    ts: new Date().toISOString(),
    posture,
    baselineHash,
    drift,
    resources,
  };

  if (opts.json) {
    console.log(JSON.stringify(report, null, 2));
    if (drift) {
      process.exitCode = 1;
    }
    return;
  }

  console.log(`\n🩺 OpenCLAW Security Doctor Report`);
  console.log(`================================`);
  console.log(`Time:     ${report.ts}`);
  console.log(`Mode:     ${posture.mode.toUpperCase()}`);
  console.log(`Exposure: ${posture.exposure}`);
  console.log(`Auth:     ${posture.auth}`);

  if (posture.dangerousCapabilities.length > 0) {
    console.log(`\nDangerous Capabilities Allowed:`);
    for (const cap of posture.dangerousCapabilities) {
      console.log(`  - ${cap}`);
    }
  } else {
    console.log(`\nDangerous Capabilities: None`);
  }

  console.log(`\nPolicy Integrity:`);
  console.log(`  Baseline Hash: ${baselineHash ?? "NOT INITIALIZED (Gateway not running?)"}`);
  console.log(`  Current Hash:  ${currentHash}`);
  console.log(`  State:         ${drift ? "⚠️ DRIFT DETECTED" : "✅ CONSISTENT"}`);

  console.log(`\nBreak-Glass Controls:`);
  for (const [key, enabled] of Object.entries(posture.breakGlass)) {
    // Check "OPENCLAW_" prefix and shorten for display if verbose? No, full key is better.
    if (enabled || opts.verbose) {
      console.log(`  ${key}: ${enabled ? "🔓 ENABLED" : "🔒 disabled"}`);
    }
  }
  if (!opts.verbose) {
    const disabledCount = Object.values(posture.breakGlass).filter((v) => !v).length;
    if (disabledCount > 0) {
      console.log(`  (... ${disabledCount} disabled flags hidden, use --verbose to see all)`);
    }
  }

  console.log(`\nResource Governance:`);
  console.log(
    `  Dangerous Ops: ${resources.concurrentDangerousOps} / ${resources.maxConcurrentDangerousOps}`,
  );

  if (drift) {
    console.log(`\n🚨 CRITICAL: Policy drift detected! Restart gateway to reset baseline.`);
    process.exitCode = 1;
  }
}
