import { Command } from "commander";
import path from "path";
import { RecoveryManager } from "../../runtime/recovery.js";

export const reportCommand = new Command("report")
  .description("Generates a diagnostic report bundle.")
  .option("--bundle", "Generates a full diagnostic zip bundle (stub)")
  .action((options) => {
    console.log("Generating diagnostic report...");
    const recoveryPath = path.join(process.cwd(), "config.json");
    const manager = new RecoveryManager(recoveryPath);

    const report = manager.generateReport();
    console.log("Report generated successfully. Check the json file in current directory.");

    if (options.bundle) {
      console.log("Bundling report with logs and config into recovery-bundle.zip... (Simulated)");
    }
  });
