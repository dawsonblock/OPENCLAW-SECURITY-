import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";

export interface UpdateManifest {
  version: string;
  downloadUrl: string;
  /** Base64-encoded RSA-SHA256 signature over `downloadUrl + version`. */
  sha256Signature: string;
}

/**
 * Handles safe, verifiable in-place updates of the OpenClaw core.
 * Ensures the new build is cryptographically signed before attempting to
 * swap the binaries. Provides instantaneous rollback on structural failure.
 */
export class Updater {
  constructor(
    private currentVersion: string,
    private publicKeyPem: string,
  ) {}

  public async checkAndUpdate(manifest: UpdateManifest): Promise<boolean> {
    console.log(`[Updater] Checking for updates. Current version: ${this.currentVersion}`);
    if (manifest.version === this.currentVersion) {
      console.log("[Updater] Already up to date.");
      return false;
    }

    console.log(`[Updater] Found new version: ${manifest.version}. Verifying signature...`);
    const isVerified = this.verifySignature(manifest);
    if (!isVerified) {
      console.error(
        "[Updater] CRITICAL: Update manifest signature verification failed. Update blocked.",
      );
      return false;
    }

    console.log("[Updater] Signature verified. Executing staging & hot-swap.");
    return this.swapBinaries(manifest.downloadUrl);
  }

  private verifySignature(manifest: UpdateManifest): boolean {
    if (!manifest.sha256Signature) {
      return false;
    }
    try {
      const verifier = crypto.createVerify("SHA256");
      // Use a fixed delimiter between fields to prevent ambiguity (e.g.
      // "http://evil.com/v1.0.0" + "" vs "http://evil.com/v" + "1.0.0").
      verifier.update(`${manifest.downloadUrl}\x00${manifest.version}`);
      // Signature is expected as base64-encoded bytes produced by the private key.
      return verifier.verify(this.publicKeyPem, manifest.sha256Signature, "base64");
    } catch {
      return false;
    }
  }

  private swapBinaries(url: string): boolean {
    try {
      const cwd = process.cwd();
      const distDir = path.join(cwd, "dist");
      const backupDir = path.join(cwd, "dist.backup");

      // Backup current build directory using fs primitives — no shell spawning.
      if (fs.existsSync(distDir)) {
        fs.cpSync(distDir, backupDir, { recursive: true });
      }

      // Download and extract the new build payload.
      console.log(`[Updater] Downloading payload from ${url}...`);
      // NOTE: Actual download/extract logic is not yet implemented. Return false
      // so callers know the update did not complete rather than silently succeeding.
      console.warn("[Updater] Download/extract not implemented; update aborted.");
      return false;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[Updater] Update failed mid-swap: ${message}. Initiating Rollback.`);
      this.rollback();
      return false;
    }
  }

  public rollback() {
    console.log("[Updater] Rolling back to previous known-good binary state...");
    const cwd = process.cwd();
    const distDir = path.join(cwd, "dist");
    const backupDir = path.join(cwd, "dist.backup");

    if (fs.existsSync(backupDir)) {
      // Remove current (potentially broken) dist and restore the backup.
      // Uses fs primitives — no shell spawning.
      if (fs.existsSync(distDir)) {
        fs.rmSync(distDir, { recursive: true, force: true });
      }
      fs.renameSync(backupDir, distDir);
      console.log("[Updater] Rollback complete.");
    } else {
      console.error("[Updater] No backup found! Manual intervention required.");
    }
  }
}
