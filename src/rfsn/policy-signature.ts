import crypto from "node:crypto";
import fs from "node:fs";

export function sha256Hex(data: Buffer): string {
  return crypto.createHash("sha256").update(data).digest("hex");
}

export function verifyDetachedSignature(params: {
  data: Buffer;
  signaturePath: string;
  publicKeyPem: string;
}): boolean {
  const signatureRaw = fs.readFileSync(params.signaturePath, "utf8").trim();
  if (!signatureRaw) {
    return false;
  }
  const signature = Buffer.from(signatureRaw, "base64");
  const verify = crypto.createVerify("sha256");
  verify.update(params.data);
  verify.end();
  if (verify.verify(params.publicKeyPem, signature)) {
    return true;
  }

  // Ed25519 signatures use direct-message verification without a hash algorithm.
  try {
    return crypto.verify(null, params.data, params.publicKeyPem, signature);
  } catch {
    return false;
  }
}
