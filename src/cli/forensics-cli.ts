import crypto from "node:crypto";
import path from "path";
import { generateAnchorProof } from "../forensics/anchor.js";
import { verifyLedger } from "../forensics/ledger-verify.js";

type ForensicVerifyOptions = {
  path?: string;
  session?: string;
};

type ForensicAnchorOptions = {
  path?: string;
  session?: string;
  key?: string;
};

function resolveLedgerPath(opts: { path?: string; session?: string }): string | null {
  if (opts.path) {
    return path.resolve(opts.path);
  }
  if (opts.session) {
    const base = process.env.OPENCLAW_HOME || path.join(process.env.HOME || "", ".openclaw");
    return path.join(base, "ledger", `${opts.session}.jsonl`);
  }
  return null;
}

export async function forensicVerifyCommand(opts: ForensicVerifyOptions) {
  const targetPath = resolveLedgerPath(opts);

  if (!targetPath) {
    console.error("Error: Must provide --path <ledger-file> or --session <session-id>");
    process.exit(1);
  }

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

export async function forensicAnchorCommand(opts: ForensicAnchorOptions) {
  const targetPath = resolveLedgerPath(opts);

  if (!targetPath) {
    console.error("Error: Must provide --path <ledger-file> or --session <session-id>");
    process.exit(1);
  }

  // 1. Verify ledger first
  const result = await verifyLedger(targetPath);
  if (!result.ok) {
    console.error("❌ Cannot anchor corrupted or invalid ledger.");
    process.exit(1);
  }

  if (!result.tipHash) {
    console.error("❌ Cannot anchor empty ledger (no tip hash).");
    process.exit(1);
  }

  // 2. Resolve Key
  let privateKeyPem = opts.key;
  if (!privateKeyPem && process.env.OPENCLAW_ANCHOR_KEY) {
    privateKeyPem = process.env.OPENCLAW_ANCHOR_KEY;
  }

  if (!privateKeyPem) {
    // Fallback: Generate a key for demonstration/dev
    console.warn("⚠️  No anchor key provided. Generating ephemeral key for demonstration.");
    const { privateKey } = crypto.generateKeyPairSync("rsa", {
      modulusLength: 2048,
      publicKeyEncoding: { type: "spki", format: "pem" },
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
    });
    privateKeyPem = privateKey;
  }

  // 3. Generate Proof
  const proof = await generateAnchorProof(result.tipHash, privateKeyPem, "openclaw-cli-anchor");

  // 4. Output
  console.log(JSON.stringify(proof, null, 2));
}

export function registerForensicsCli(program: unknown) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const forensics = (program as any)
    .command("forensic")
    .description("Forensics tools (ledger verification, anchoring)");

  forensics
    .command("verify")
    .description("Verify ledger integrity (hash chain + sidecar)")
    .option("--path <file>", "Path to ledger file")
    .option("--session <id>", "Session ID (looks in default ledger dir)")
    .action(forensicVerifyCommand);

  forensics
    .command("anchor")
    .description("Generate an anchor proof for the ledger tip")
    .option("--path <file>", "Path to ledger file")
    .option("--session <id>", "Session ID (looks in default ledger dir)")
    .option("--key <pem>", "Private key for signing (PEM)")
    .action(forensicAnchorCommand);
}
