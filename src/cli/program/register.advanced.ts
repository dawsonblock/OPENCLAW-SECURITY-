import { Command } from "commander";
import { explainCommand } from "../commands/explain.js";
import { recoverCommand } from "../commands/recover.js";
import { repairCommand } from "../commands/repair.js";
import { replayCommand } from "../commands/replay.js";
import { reportCommand } from "../commands/report.js";
import { statusCommand as advStatusCommand } from "../commands/status.js";
import { upCommand } from "../commands/up.js";

export function registerAdvancedCommands(program: Command) {
  program.addCommand(upCommand);
  program.addCommand(repairCommand);
  program.addCommand(advStatusCommand.name("adv-status"));
  program.addCommand(recoverCommand);
  program.addCommand(reportCommand);
  program.addCommand(replayCommand);
  program.addCommand(explainCommand);
}
