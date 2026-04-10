import { Command } from "commander";
import path from "path";
import { RecoveryManager } from "../../runtime/recovery.js";

export const recoverCommand = new Command("recover")
  .description(
    "Triggers lightweight safe-mode fallback, writes a recovery report, and restores config from config.json.bak when present.",
  )
  .action(() => {
    console.log("Initiating lightweight OpenClaw recovery fallback...");
    const recoveryPath = path.join(process.cwd(), "config.json");
    const manager = new RecoveryManager(recoveryPath);

    manager.triggerSafeMode("manual-recovery");
    console.log(
      "Recovery fallback complete. Safe mode is active and config.json.bak was restored if available.",
    );
  });
