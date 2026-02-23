import { LedgerEntry } from "../ledger/hash_chain.js";
import { SerialEngine } from "./serial_engine.js";

/**
 * Deterministic Replay Engine to verify state consistency from recorded ledgers.
 */
export class ReplayEngine {
  /**
   * Replays a list of ledger entries sequentially against an initial state,
   * verifying that intermediate hashes and final state hashes match perfectly.
   */
  public static async verifyReplay(
    initialState: Record<string, any>,
    seed: string,
    entries: LedgerEntry[],
    executorMock: (intent: string, payload: any) => Promise<Record<string, any>>,
  ): Promise<boolean> {
    console.log(`[ReplayEngine] Starting deterministic replay of ${entries.length} actions...`);
    const engine = new SerialEngine(initialState, executorMock, seed);

    let matchCount = 0;

    for (const recordedEntry of entries) {
      console.log(
        `[ReplayEngine] Replaying step ${recordedEntry.index}: ${recordedEntry.actionType}`,
      );
      try {
        // Execute mock step
        const newEntry = await engine.dispatchIntent(
          recordedEntry.actionType,
          recordedEntry.payload.payload,
        );

        // Compare state hashes
        if (newEntry.payload.stateHash !== recordedEntry.payload.stateHash) {
          console.error(`[ReplayEngine] Hash mismatch at step ${recordedEntry.index}!`);
          console.error(`Expected: ${recordedEntry.payload.stateHash}`);
          console.error(`Actual:   ${newEntry.payload.stateHash}`);
          return false;
        }

        matchCount++;
      } catch (err) {
        console.error(`[ReplayEngine] Replay failed at step ${recordedEntry.index}:`, err);
        return false;
      }
    }

    console.log(
      `[ReplayEngine] Replay successful. Hash match rate: ${(matchCount / entries.length) * 100}%`,
    );
    return true;
  }
}
