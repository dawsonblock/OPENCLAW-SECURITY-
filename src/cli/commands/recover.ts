import { Command } from "commander";
import path from "path";
import { RecoveryManager } from "../../runtime/recovery.js";

export const recoverCommand = new Command("recover")
  .description("Automatically recovers the system from a fault state and returns to usable config.")
  .action(() => {
    console.log("Initiating openclaw system recovery...");
    const recoveryPath = path.join(process.cwd(), "config.json");
    const manager = new RecoveryManager(recoveryPath);

    manager.triggerSafeMode("manual-recovery");
    console.log("System has been recovered to safe mode with last known good config.");
  });
