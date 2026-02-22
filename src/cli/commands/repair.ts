import { execSync } from "child_process";
import { Command } from "commander";
import * as fs from "fs";
import path from "path";
import { RecoveryManager } from "../../runtime/recovery.js";

export const repairCommand = new Command("repair")
  .description(
    "Automatically fixes common faults based on doctor output without human intervention.",
  )
  .action(() => {
    console.log("🔧 Attempting automatic system remediation...");

    // Example logic: fixing missing directories or config syntax errors.
    const configPath = path.join(process.cwd(), "config.json");

    try {
      if (!fs.existsSync(configPath)) {
        console.log("[Repair] Missing configuration. Restoring defaults...");
        execSync("openclaw up");
      } else {
        JSON.parse(fs.readFileSync(configPath, "utf8"));
      }
      console.log("✅ Config syntax validated.");
    } catch (err) {
      console.error(
        "❌ Config is corrupt. Generating backup and resetting to last known good (Safe Mode).",
      );
      const manager = new RecoveryManager(configPath);
      manager.triggerSafeMode("repair-auto");
    }

    console.log("✅ Remediation pass complete. Run `openclaw doctor` to verify.");
  });
