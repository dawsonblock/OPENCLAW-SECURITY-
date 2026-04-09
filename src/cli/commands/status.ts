import { Command } from "commander";
import { HealthMonitor } from "../../runtime/health_monitor.js";

export const statusCommand = new Command("status")
  .description("Displays a compact status wall of the single source of truth runtime state.")
  .action(async () => {
    const monitor = new HealthMonitor();
    const health = await monitor.checkHealth();
    monitor.printStatusWall(health);
  });
