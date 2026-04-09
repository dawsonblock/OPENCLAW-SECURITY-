import { HashChainLedger, LedgerEntry } from "../ledger/hash_chain.js";
import { SnapshotManager, Snapshot } from "../state/snapshot.js";

type PolicyGateFn = (intent: string, payload: any) => boolean | Promise<boolean>;
type ExecutorFn = (
  intent: string,
  payload: any,
) => Record<string, any> | Promise<Record<string, any>>;

/**
 * Deterministic action pipeline.
 * Intent -> Policy Gate -> Capability Graph -> Executor -> Ledger -> State Commit
 */
export class SerialEngine {
  private isExecuting: boolean = false;
  private state: Record<string, any> = {};
  private ledger: HashChainLedger;
  private policyGates: PolicyGateFn[] = [];
  private executor: ExecutorFn;

  constructor(initialState: Record<string, any>, executor: ExecutorFn, seed: string = "genesis") {
    this.state = JSON.parse(JSON.stringify(initialState));
    this.executor = executor;
    this.ledger = new HashChainLedger(seed);
  }

  public addPolicyGate(gate: PolicyGateFn) {
    this.policyGates.push(gate);
  }

  /**
   * Executes an intent serially. No asynchronous overlapping executions are allowed.
   */
  public async dispatchIntent(intent: string, payload: any): Promise<LedgerEntry> {
    if (this.isExecuting) {
      throw new Error("SerialEngine is already executing an action. Parallel execution blocked.");
    }

    this.isExecuting = true;

    try {
      // 1. Policy Gate
      for (const gate of this.policyGates) {
        const allowed = await gate(intent, payload);
        if (!allowed) {
          throw new Error(`Policy gate rejected intent: ${intent}`);
        }
      }

      // 2. Snapshot (pre-execution) for rollback capability if needed
      const preSnapshot = SnapshotManager.createSnapshot(this.state);

      // 3. Executor
      const diff = await this.executor(intent, payload);

      // 4. State Commit
      this.state = this.deepMerge(this.state, diff);

      // 5. Ledger
      const entryPayload = {
        intent,
        payload,
        diff,
        stateHash: SnapshotManager.generateHash(this.state),
      };
      const entry = this.ledger.append(intent, entryPayload);

      return entry;
    } finally {
      this.isExecuting = false;
    }
  }

  public getState(): Readonly<Record<string, any>> {
    return this.state;
  }

  public getLedger(): HashChainLedger {
    return this.ledger;
  }

  public takeSnapshot(): Snapshot {
    return SnapshotManager.createSnapshot(this.state);
  }

  private deepMerge(target: any, source: any): any {
    const result = { ...target };
    for (const key of Object.keys(source)) {
      if (source[key] instanceof Object && key in target) {
        Object.assign(source[key], this.deepMerge(target[key], source[key]));
      }
    }
    Object.assign(result || {}, source);
    return result;
  }
}
