import { resolveAgentDir } from "../src/agents/agent-scope.js";
import { loadAgentInstructions } from "../src/agents/instruction-loader.js";
import { loadConfig } from "../src/config/config.js";

async function verify() {
  console.log("--- Verifying Operator Workflows ---");

  // 1. Verify Configuration Defaults
  const cfg = loadConfig();
  const agents = cfg.agents?.list || [];
  const agentIds = agents.map((a) => (typeof a.id === "string" ? a.id : ""));

  console.log("Agent IDs in config:", agentIds);
  const required = ["triage", "coder", "admin"];
  const missing = required.filter((id) => !agentIds.includes(id));

  if (missing.length === 0) {
    console.log("✅ All operator agents found in config.");
  } else {
    console.error("❌ Missing agents:", missing);
  }

  // 2. Verify Instruction Loading
  for (const id of required) {
    const agentDir = resolveAgentDir(cfg, id);
    const instructions = await loadAgentInstructions({ agentId: id, agentDir });
    if (instructions) {
      console.log(`✅ Instructions loaded for ${id} (${instructions.length} bytes)`);
    } else {
      console.error(`❌ Instructions NOT found for ${id}`);
    }
  }

  console.log("--- Verification Complete ---");
}

verify().catch((err) => {
  console.error("Verification failed:", err);
  process.exit(1);
});
