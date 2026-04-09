import fs from "fs/promises";
import os from "os";
import path from "path";
import { verifyLedger } from "../src/forensics/ledger-verify.js";
import { appendLedgerEntry } from "../src/rfsn/ledger.js";

async function main() {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "ledger-test-"));
  console.log(`Created temp dir: ${tmpDir}`);

  const workspaceDir = tmpDir;
  const sessionId = "test-session";
  const ledgerPath = path.join(workspaceDir, ".openclaw", "ledger", `${sessionId}.jsonl`);

  console.log("Appending entries...");
  await appendLedgerEntry({
    workspaceDir,
    sessionId,
    entry: {
      ts: Date.now(),
      tool: "test-tool",
      args: { foo: "bar" },
      result: { status: "ok", toolName: "test-tool", durationMs: 100 },
    },
  });

  await appendLedgerEntry({
    workspaceDir,
    sessionId,
    entry: {
      ts: Date.now(),
      tool: "test-tool-2",
      args: { baz: "qux" },
      result: { status: "ok", toolName: "test-tool-2", durationMs: 200 },
    },
  });

  console.log("Verifying ledger...");
  const result = await verifyLedger(ledgerPath);

  if (result.ok) {
    console.log("✅ Verification SUCCESS");
    console.log(`   Entries: ${result.entries}`);
    console.log(`   Tip Hash: ${result.tipHash}`);
  } else {
    console.error("❌ Verification FAILED");
    console.error(result.error);
    process.exit(1);
  }

  // Corrupt the ledger and verify failure
  console.log("Corrupting ledger...");
  const content = await fs.readFile(ledgerPath, "utf8");
  const corrupted = content.replace("test-tool", "hacked-tool");
  await fs.writeFile(ledgerPath, corrupted, "utf8");

  const resultCorrupt = await verifyLedger(ledgerPath);
  if (!resultCorrupt.ok) {
    console.log("✅ Corruption correctly detected");
    console.log(`   Error: ${resultCorrupt.error}`);
  } else {
    console.error("❌ Corruption NOT detected");
    process.exit(1);
  }

  // Cleanup
  await fs.rm(tmpDir, { recursive: true, force: true });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
