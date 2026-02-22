import { Command } from "commander";
import { HealthMonitor } from "../../runtime/health_monitor.js";

export const doctorCommand = new Command("doctor")
  .description(
    "Interactive diagnostic wizard checking tokens, providers, tool permissions, and sandbox setup.",
  )
  .action(async () => {
    console.log("🩺 OpenClaw Diagnostic Wizard");
    console.log("Analyzing system readiness...\n");

    const monitor = new HealthMonitor();
    const health = await monitor.checkHealth();

    let issues = 0;

    // Check Gateway
    if (health.gateway.status === "up") {
      console.log("✅ Gateway: ONLINE");
    } else {
      console.log("❌ Gateway: OFFLINE");
      issues++;
    }

    // Check Agents
    if (health.agents.running && health.agents.modelReachable) {
      console.log("✅ Core Model: REACHABLE");
    } else {
      console.log("❌ Core Model: UNREACHABLE (Check API keys or local server)");
      issues++;
    }

    // Check Sandbox
    if (health.tools.sandboxOk) {
      console.log("✅ Execution Sandbox: SECURE");
    } else {
      console.log("❌ Execution Sandbox: Bypassed or improperly configured!");
      issues++;
    }

    // Check Providers
    const brokenProviders = health.providers.filter((p) => p.status === "error");
    if (brokenProviders.length === 0) {
      console.log(`✅ Providers: ${health.providers.length} configured properly.`);
    } else {
      for (const p of brokenProviders) {
        console.log(`❌ Provider: ${p.name} failing (${p.lastError})`);
        issues++;
      }
    }

    console.log("\n-------------------------------------");
    if (issues === 0) {
      console.log("🏥 Diagnosis: Healthy. System is ready.");
    } else {
      console.log(`🏥 Diagnosis: Found ${issues} issues.`);
      console.log("Run `openclaw repair` to attempt automatic remediation of standard faults.");
    }
  });
