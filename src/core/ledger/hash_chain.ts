import { createHash } from "crypto";

export interface LedgerEntry {
  index: number;
  timestamp: number;
  actionType: string;
  payload: any;
  previousHash: string;
  hash: string;
}

/**
 * Cryptographic hash-chained ledger for action immutability.
 */
export class HashChainLedger {
  private entries: LedgerEntry[] = [];

  constructor(private seed: string = "genesis") {
    this.append("GENESIS", { seed });
  }

  public append(actionType: string, payload: any): LedgerEntry {
    const index = this.entries.length;
    const timestamp = Date.now();
    const previousHash = index > 0 ? this.entries[index - 1].hash : this.seed;

    // Ensure deterministic payload sorting
    const serializedPayload = JSON.stringify(this.sortKeys(payload));
    const hashPayload = `${index}:${timestamp}:${actionType}:${serializedPayload}:${previousHash}`;
    const hash = createHash("sha256").update(hashPayload).digest("hex");

    const entry: LedgerEntry = {
      index,
      timestamp,
      actionType,
      payload: JSON.parse(JSON.stringify(payload)), // Deep copy
      previousHash,
      hash,
    };

    this.entries.push(entry);
    return entry;
  }

  public getEntries(): LedgerEntry[] {
    return this.entries;
  }

  public getLastEntry(): LedgerEntry {
    return this.entries[this.entries.length - 1];
  }

  public verify(): boolean {
    for (let i = 1; i < this.entries.length; i++) {
      const current = this.entries[i];
      const prev = this.entries[i - 1];

      if (current.previousHash !== prev.hash) {
        return false;
      }

      const serializedPayload = JSON.stringify(this.sortKeys(current.payload));
      const hashPayload = `${current.index}:${current.timestamp}:${current.actionType}:${serializedPayload}:${current.previousHash}`;
      const expectedHash = createHash("sha256").update(hashPayload).digest("hex");

      if (current.hash !== expectedHash) {
        return false;
      }
    }
    return true;
  }

  private sortKeys(obj: any): any {
    if (typeof obj !== "object" || obj === null) {
      return obj;
    }
    if (Array.isArray(obj)) {
      return obj.map((i) => this.sortKeys(i));
    }
    return Object.keys(obj)
      .toSorted()
      .reduce((acc: any, key: string) => {
        acc[key] = this.sortKeys(obj[key]);
        return acc;
      }, {});
  }
}
