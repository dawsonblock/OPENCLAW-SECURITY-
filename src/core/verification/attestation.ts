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
 *
 * IMPORTANT: This implementation uses an ephemeral in-process RSA keypair
 * generated at construction time. The keypair exists only for the lifetime of
 * this object and is never stored to disk or backed by hardware security.
 *
 * This provides tamper-evidence for a single process session (i.e. you can
 * detect post-hoc modification of a bundle produced in the same session), but
 * it does NOT provide hardware-backed attestation, TPM binding, Secure
 * Enclave integration, or cross-session verification.
 *
 * Do not describe or market this as hardware-root-of-trust attestation.
 */
export class AttestationEngine {
  private privateKeyPem: string;
  private publicKeyPem: string;

  constructor() {
    // Ephemeral keypair – valid only for this process session.
    // Not backed by TPM, Secure Enclave, or any hardware security module.
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
    const signature = this.signWithEphemeralKey(payloadToSign);

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
    console.log(`[AttestationEngine] Saved session-signed bundle to ${bundlePath}`);

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
   * Signs the payload using the ephemeral in-process RSA private key.
   * This key is NOT hardware-backed; it provides only session-scoped tamper-evidence.
   */
  private signWithEphemeralKey(payload: string): string {
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
    };
  }

  public getPublicKey(): string {
    return this.publicKeyPem;
  }
}
