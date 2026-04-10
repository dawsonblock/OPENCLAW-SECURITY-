import { Command } from "commander";
import * as fs from "fs";
import path from "path";
import { RecoveryManager } from "../../runtime/recovery.js";

export const repairCommand = new Command("repair")
  .description(
    "Attempts bounded local repair steps for common config faults, then falls back to safe mode and .bak restore if needed.",
  )
  .action(() => {
    console.log("Attempting bounded local repair steps...");

    // Example logic: fixing missing directories or config syntax errors.
    const configPath = path.join(process.cwd(), "config.json");

    try {
      if (!fs.existsSync(configPath)) {
        console.log("[Repair] Missing configuration. Recreating a minimal local config.");
        const defaultConfig = {
          gateway: { bind: "127.0.0.1:8080", authMode: "strict" },
          profiles: { default: "Safe" },
        };
        fs.writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2), "utf8");
      } else {
        JSON.parse(fs.readFileSync(configPath, "utf8"));
      }
      console.log("✅ Config syntax validated.");
    } catch (err) {
      console.error(
        "Config is corrupt. Activating safe-mode fallback and restoring config.json.bak if it exists.",
      );
      const manager = new RecoveryManager(configPath);
      manager.triggerSafeMode("repair-auto");
    }

    console.log("Repair pass complete. Run `openclaw doctor` to verify the runtime state.");
  });
