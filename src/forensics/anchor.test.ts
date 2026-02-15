import crypto from "node:crypto";
import { describe, expect, it } from "vitest";
import { generateAnchorProof, verifyAnchorProof } from "./anchor.js";

describe("Forensics Anchor", () => {
  // Generate a keypair for testing
  const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });

  it("generates and verifies a valid proof", async () => {
    const hash = "abc123hash";
    const proof = await generateAnchorProof(hash, privateKey);

    expect(proof.ledgerHash).toBe(hash);
    expect(proof.timestamp).toBeLessThanOrEqual(Date.now());

    const isValid = await verifyAnchorProof(proof, publicKey);
    expect(isValid).toBe(true);
  });

  it("fails verification if data is tampered", async () => {
    const hash = "original-hash";
    const proof = await generateAnchorProof(hash, privateKey);

    // Tamper with hash
    const tamperedProof = { ...proof, ledgerHash: "tampered-hash" };
    const isValid = await verifyAnchorProof(tamperedProof, publicKey);
    expect(isValid).toBe(false);
  });

  it("fails verification if timestamp is tampered", async () => {
    const hash = "original-hash";
    const proof = await generateAnchorProof(hash, privateKey);

    // Tamper with timestamp
    const tamperedProof = { ...proof, timestamp: proof.timestamp + 1000 };
    const isValid = await verifyAnchorProof(tamperedProof, publicKey);
    expect(isValid).toBe(false);
  });

  it("fails verification with wrong public key", async () => {
    const { publicKey: wrongPublicKey } = crypto.generateKeyPairSync("rsa", {
      modulusLength: 2048,
      publicKeyEncoding: { type: "spki", format: "pem" },
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
    });

    const hash = "hash";
    const proof = await generateAnchorProof(hash, privateKey);

    const isValid = await verifyAnchorProof(proof, wrongPublicKey);
    expect(isValid).toBe(false);
  });
});
