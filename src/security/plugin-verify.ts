import crypto from "node:crypto";
import fs from "node:fs";

export function verifyPluginArtifact(params: {
  artifactPath: string;
  signaturePath: string;
  publicKeyPem: string;
}): boolean {
  const artifact = fs.readFileSync(params.artifactPath);
  const signatureBase64 = fs.readFileSync(params.signaturePath, "utf8").trim();
  if (!signatureBase64) {
    return false;
  }
  const signature = Buffer.from(signatureBase64, "base64");
  const verifier = crypto.createVerify("RSA-SHA256");
  verifier.update(artifact);
  verifier.end();
  return verifier.verify(params.publicKeyPem, signature);
}
