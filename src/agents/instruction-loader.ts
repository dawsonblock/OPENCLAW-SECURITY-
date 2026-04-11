import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { logVerbose } from "../logger.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Loads specialized instructions for an agent.
 * Checks for:
 * 1. Bundled instructions in src/agents/instructions/${agentId}.md
 * 2. Custom instructions in ${agentDir}/instructions.md
 */
export async function loadAgentInstructions(params: {
  agentId: string;
  agentDir?: string;
}): Promise<string | undefined> {
  const { agentId, agentDir } = params;

  // 1. Check bundled instructions
  const bundledPath = path.join(__dirname, "instructions", `${agentId}.md`);
  try {
    if (fs.existsSync(bundledPath)) {
      logVerbose(`Loading bundled instructions for agent ${agentId} from ${bundledPath}`);
      return await fs.promises.readFile(bundledPath, "utf8");
    }
  } catch (err) {
    logVerbose(`Failed to read bundled instructions for ${agentId}: ${String(err)}`);
  }

  // 2. Check custom instructions in agentDir
  if (agentDir) {
    const customPath = path.join(agentDir, "instructions.md");
    try {
      if (fs.existsSync(customPath)) {
        logVerbose(`Loading custom instructions for agent ${agentId} from ${customPath}`);
        return await fs.promises.readFile(customPath, "utf8");
      }
    } catch (err) {
      logVerbose(`Failed to read custom instructions for ${agentId} in ${agentDir}: ${String(err)}`);
    }
  }

  return undefined;
}
