import path from "path";
import { verifyLedger } from "../forensics/ledger-verify.js";

type ForensicVerifyOptions = {
  path?: string;
  session?: string;
};

export async function forensicVerifyCommand(opts: ForensicVerifyOptions) {
  let targetPath = opts.path;

  if (!targetPath && opts.session) {
    const base = process.env.OPENCLAW_HOME || path.join(process.env.HOME || "", ".openclaw");
    targetPath = path.join(base, "ledger", `${opts.session}.jsonl`);
  }

  if (!targetPath) {
    console.error("Error: Must provide --path <ledger-file> or --session <session-id>");
    process.exit(1);
  }

  targetPath = path.resolve(targetPath);
  console.log(`Verifying ledger integrity at: ${targetPath}`);

  const result = await verifyLedger(targetPath);

  if (!result.ok) {
    console.error("❌ Ledger verification FAILED");
    console.error(`   Error: ${result.error}`);
    console.error(`   Lines verified: ${result.entries}`);
    if (result.tipHash) {
      console.error(`   Last valid hash: ${result.tipHash}`);
    }
    process.exit(1);
  }

  console.log("✅ Ledger Verified Successfully");
  console.log(`   Entries: ${result.entries}`);
  console.log(`   Tip Hash: ${result.tipHash}`);
  console.log(`   Sidecar: Match`);
}
