import crypto from "node:crypto";

export type AnchorProof = {
  timestamp: number;
  ledgerHash: string;
  signature: string;
  anchorId: string; // Identifier of the key/service used
};

/**
 * Generates a signed proof for a given ledger tip hash.
 * In a real scenario, this might call an external timestamping service.
 * Here, we simulate it by signing with a local private key.
 */
export async function generateAnchorProof(
  ledgerTipHash: string,
  privateKeyPem: string,
  anchorId: string = "local-anchor",
): Promise<AnchorProof> {
  const timestamp = Date.now();
  const payload = `${anchorId}:${timestamp}:${ledgerTipHash}`;

  const signer = crypto.createSign("SHA256");
  signer.update(payload);
  signer.end();

  const signature = signer.sign(privateKeyPem, "hex");

  return {
    timestamp,
    ledgerHash: ledgerTipHash,
    signature,
    anchorId,
  };
}

/**
 * Verifies the integrity and authenticity of an anchor proof.
 */
export async function verifyAnchorProof(
  proof: AnchorProof,
  publicKeyPem: string,
): Promise<boolean> {
  const payload = `${proof.anchorId}:${proof.timestamp}:${proof.ledgerHash}`;

  const verifier = crypto.createVerify("SHA256");
  verifier.update(payload);
  verifier.end();

  return verifier.verify(publicKeyPem, proof.signature, "hex");
}
