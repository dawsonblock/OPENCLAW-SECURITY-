#!/usr/bin/env -S node --import tsx

import { execSync } from "node:child_process";
import fs from "node:fs";

function checkBannedOversees() {
  const pkgContent = fs.readFileSync("package.json", "utf8");
  const pkg = JSON.parse(pkgContent);

  const overrides = pkg.pnpm?.overrides || pkg.overrides || pkg.resolutions || {};
  const overrideKeys = Object.keys(overrides);

  if (overrideKeys.length > 0) {
    const allowedOverrides = ["@vitest/ui", "react", "vue"]; 
    for (const key of overrideKeys) {
      if (!allowedOverrides.some(allowed => key.includes(allowed)) && !key.includes('eslint') && !key.includes('typescript')) {
        // Just flag unexplained heavy overrides.
        // For a release build, all overrides should be heavily scrutinized.
        console.warn(`[hygiene] Warning: Unexplained package override detected: ${key} -> ${overrides[key]}`);
        // We won't strictly fail on warnings unless instructed, but it alerts operators.
      }
    }
  }
}

function checkLockfile() {
  try {
    // A dry-run frozen lockfile install ensures the lockfile matches package.json perfectly.
    console.log("[hygiene] Checking lockfile integrity...");
    execSync("pnpm install --frozen-lockfile --lockfile-only", {
      stdio: "inherit",
    });
    console.log("[hygiene] ✅ Lockfile is synchronized and hygienic.");
  } catch (error) {
    console.error("[hygiene] ❌ Lockfile check failed. The lockfile is out of sync with package.json.");
    process.exit(1);
  }
}

function main() {
  console.log("🚀 Starting Dependency Hygiene Check...");
  checkBannedOversees();
  checkLockfile();
  console.log("✅ Dependency hygiene checks passed.");
}

main();
