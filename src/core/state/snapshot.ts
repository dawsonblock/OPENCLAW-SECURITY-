import { createHash } from "crypto";

export interface Snapshot {
  id: string;
  timestamp: number;
  state: Record<string, any>;
  hash: string;
}

/**
 * Deterministic memory snapshot generator.
 */
export class SnapshotManager {
  static generateHash(state: Record<string, any>): string {
    const sortedState = this.sortKeys(state);
    const serialized = JSON.stringify(sortedState);
    return createHash("sha256").update(serialized).digest("hex");
  }

  static createSnapshot(state: Record<string, any>): Snapshot {
    const timestamp = Date.now();
    const hash = this.generateHash(state);
    return {
      id: `snap_${timestamp}_${hash.substring(0, 8)}`,
      timestamp,
      state: JSON.parse(JSON.stringify(state)), // deep copy
      hash,
    };
  }

  // Ensure deterministic serialization
  private static sortKeys(obj: any): any {
    if (typeof obj !== "object" || obj === null) {
      return obj;
    }
    if (Array.isArray(obj)) {
      return obj.map(SnapshotManager.sortKeys);
    }
    return Object.keys(obj)
      .toSorted()
      .reduce((result: any, key: string) => {
        result[key] = SnapshotManager.sortKeys(obj[key]);
        return result;
      }, {});
  }
}
