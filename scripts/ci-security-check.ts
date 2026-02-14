import { readFileSync, existsSync } from "node:fs";

console.log("🔒 Running OpenCLAW Security Integrity Check...");

const LOCKDOWN_MODULES = [
  "src/security/lockdown/invariants.ts",
  "src/security/lockdown/posture.ts",
  "src/security/lockdown/policy-snapshot.ts",
  "src/security/lockdown/runtime-assert.ts",
  "src/security/lockdown/executor-guard.ts",
  "src/security/lockdown/secret-scrubber.ts",
  "src/security/lockdown/resource-governor.ts",
];

let failed = false;

// 1. Verify existence of lockdown modules
for (const mod of LOCKDOWN_MODULES) {
  if (!existsSync(mod)) {
    console.error(`❌ Missing critical security module: ${mod}`);
    failed = true;
  } else {
    console.log(`✅ ${mod} found`);
  }
}

// 2. Scan package.json for unsafe flags in production scripts
try {
  const pkg = JSON.parse(readFileSync("package.json", "utf8"));
  const scripts = pkg.scripts || {};
  for (const [name, cmd] of Object.entries(scripts)) {
    if (typeof cmd === "string") {
      if (cmd.includes("NODE_TLS_REJECT_UNAUTHORIZED=0")) {
        console.error(`❌ Detailed TLS security disabled in script '${name}'`);
        failed = true;
      }
    }
  }
} catch (err) {
  console.error(`❌ Failed to parse package.json: ${err}`);
  failed = true;
}

if (failed) {
  console.error("\n❌ Security Integrity Check FAILED");
  process.exit(1);
}

console.log("\n✅ Security Integrity Check PASSED");
