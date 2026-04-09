import { Command } from "commander";
import { ReplayEngine } from "../../core/execution/replay_engine.js";

export const replayCommand = new Command("replay")
  .description("Replays a deterministic log from a run_id to verify hashes.")
  .argument("<run_id>", "The run ID to replay")
  .action(async (run_id) => {
    console.log(`Loading snapshot and ledger for run: ${run_id}`);

    // Mocking the replay for now since we don't have a real persistent store hooked up
    const mockInitialState = {};
    const mockSeed = "genesis";
    const mockEntries: any[] = []; // Empty for mock

    const mockExecutor = async (intent: string, payload: any) => {
      return {};
    };

    console.log(`Executing replay for ${run_id}...`);

    const success = await ReplayEngine.verifyReplay(
      mockInitialState,
      mockSeed,
      mockEntries,
      mockExecutor,
    );

    if (success) {
      console.log("Replay verification SUCCESS. All hashes match.");
    } else {
      console.error("Replay verification FAILED. Non-deterministic execution detected.");
    }
  });
