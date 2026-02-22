import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";
import { LedgerEntry } from "../ledger/hash_chain.js";
import { Snapshot } from "../state/snapshot.js";

export interface AttestationBundle {
  version: string;
  timestamp: number;
  machineInfo: Record<string, string>;
  initialSnapshot: Snapshot;
  ledger: LedgerEntry[];
  finalHash: string;
  signature: string;
}

/**
 * Generates and verifies cryptographic bundles of agent runs.
 * Supports stubs for Hardware Root-of-Trust (e.g., Secure Enclave, TPM).
 */
export class AttestationEngine {
  private privateKeyPem: string;
  private publicKeyPem: string;

  constructor() {
    // In a real system, these would securely load from TPM / Secure Enclave.
    // For development, we auto-generate an ephemeral keypair.
    const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", {
      modulusLength: 2048,
      publicKeyEncoding: { type: "spki", format: "pem" },
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
    });

    this.publicKeyPem = publicKey;
    this.privateKeyPem = privateKey;
  }

  public generateBundle(initialSnapshot: Snapshot, ledger: LedgerEntry[]): AttestationBundle {
    const finalHash = ledger.length > 0 ? ledger[ledger.length - 1].hash : initialSnapshot.hash;

    const payloadToSign = `${initialSnapshot.id}:${finalHash}:${ledger.length}`;
    const signature = this.signWithHardware(payloadToSign);

    const bundle: AttestationBundle = {
      version: "1.0",
      timestamp: Date.now(),
      machineInfo: this.getMachineInfo(),
      initialSnapshot,
      ledger,
      finalHash,
      signature,
    };

    const bundlePath = path.join(process.cwd(), `attestation-${initialSnapshot.id}.json`);
    fs.writeFileSync(bundlePath, JSON.stringify(bundle, null, 2), "utf8");
    console.log(`[AttestationEngine] Saved cryptographically signed bundle to ${bundlePath}`);

    return bundle;
  }

  public verifyBundle(bundle: AttestationBundle): boolean {
    const payloadToVerify = `${bundle.initialSnapshot.id}:${bundle.finalHash}:${bundle.ledger.length}`;
    const verifier = crypto.createVerify("SHA256");
    verifier.update(payloadToVerify);
    verifier.end();

    const isValid = verifier.verify(this.publicKeyPem, bundle.signature, "hex");
    if (!isValid) {
      console.error(
        "[AttestationEngine] Invalid signature! The run bundle may have been tampered with.",
      );
    }
    return isValid;
  }

  /**
   * Stub for integrating with a TPM or Secure Enclave.
   */
  private signWithHardware(payload: string): string {
    const sign = crypto.createSign("SHA256");
    sign.update(payload);
    sign.end();
    return sign.sign(this.privateKeyPem, "hex");
  }

  private getMachineInfo(): Record<string, string> {
    return {
      platform: process.platform,
      arch: process.arch,
      nodeVersion: process.version,
      // hardware id stubs
      tpmStubs: "secure-enclave-capable",
    };
  }

  public getPublicKey(): string {
    return this.publicKeyPem;
  }
}
