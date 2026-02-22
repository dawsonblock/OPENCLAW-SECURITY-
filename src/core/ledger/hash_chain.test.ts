import { describe, it, expect, beforeEach } from "vitest";
import { HashChainLedger } from "./hash_chain.js";

describe("HashChainLedger", () => {
  let ledger: HashChainLedger;

  beforeEach(() => {
    ledger = new HashChainLedger();
  });

  it("should initialize with a genesis block", () => {
    const entries = ledger.getEntries();
    expect(entries.length).toBe(1);
    expect(entries[0].actionType).toBe("GENESIS");
    expect(entries[0].previousHash).toBe("genesis");
  });

  it("should correctly chain new entries", () => {
    const entry1 = ledger.append("task_1", { key: "value1" });
    const entry2 = ledger.append("task_2", { key: "value2" });

    const entries = ledger.getEntries();
    expect(entries.length).toBe(3);

    expect(entry1.previousHash).toBe(entries[0].hash);
    expect(entry2.previousHash).toBe(entry1.hash);

    expect(ledger.verify()).toBe(true);
  });

  it("should detect tampering", () => {
    ledger.append("task_1", { key: "value1" });
    ledger.append("task_2", { key: "value2" });

    // Manually tamper with the first user-added entry payload
    const entries = ledger.getEntries();
    entries[1].payload = { key: "tampered" };

    expect(ledger.verify()).toBe(false);
  });
});
