#!/usr/bin/env node
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const SCAN_EXTENSIONS = new Set([".ts", ".js", ".json", ".yml", ".yaml", ".md"]);
const ALLOWED_PATH_PREFIXES = ["src/", "scripts/", "deploy/"];
const IGNORE_FILES = new Set([
  "scripts/ci-secret-scan.js",
  "src/rfsn/redact.ts",
  "src/rfsn/redact.test.ts",
  "src/security/skill-scanner.ts",
]);

const RULES = [
  { name: "openai-sk", regex: /\bsk-[A-Za-z0-9_-]{24,}\b/g },
  { name: "github-pat", regex: /\bghp_[A-Za-z0-9]{30,}\b/g },
  { name: "aws-akia", regex: /\bAKIA[0-9A-Z]{16}\b/g },
  { name: "bearer-token", regex: /Bearer\s+[A-Za-z0-9._-]{24,}/g },
  {
    name: "hardcoded-key-assignment",
    regex:
      /\b(OPENAI_API_KEY|ANTHROPIC_API_KEY|GITHUB_TOKEN|GOOGLE_API_KEY)\b\s*[:=]\s*["'][^"'\n]{12,}["']/g,
  },
];

function listTrackedFiles() {
  const raw = execSync("git ls-files", { cwd: ROOT, encoding: "utf8" });
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function shouldScan(relPath) {
  if (IGNORE_FILES.has(relPath)) {
    return false;
  }
  if (/\.(test|spec)\.ts$/.test(relPath) || relPath.endsWith(".e2e.test.ts")) {
    return false;
  }
  if (!ALLOWED_PATH_PREFIXES.some((prefix) => relPath.startsWith(prefix))) {
    return false;
  }
  const ext = path.extname(relPath);
  return SCAN_EXTENSIONS.has(ext);
}

function isIntentionalSafeLine(line) {
  return (
    line.includes("REPLACE_WITH") ||
    line.includes("[REDACTED]") ||
    line.includes("EXAMPLE") ||
    line.includes("example")
  );
}

function scanFile(relPath) {
  const absPath = path.join(ROOT, relPath);
  let raw;
  try {
    raw = fs.readFileSync(absPath, "utf8");
  } catch {
    return [];
  }
  const lines = raw.split(/\r?\n/);
  const findings = [];

  lines.forEach((line, index) => {
    if (!line || isIntentionalSafeLine(line)) {
      return;
    }
    for (const rule of RULES) {
      if (rule.regex.test(line)) {
        findings.push({
          file: relPath,
          line: index + 1,
          rule: rule.name,
          text: line.trim().slice(0, 180),
        });
      }
      rule.regex.lastIndex = 0;
    }
  });
  return findings;
}

const findings = [];
for (const relPath of listTrackedFiles()) {
  if (!shouldScan(relPath)) {
    continue;
  }
  findings.push(...scanFile(relPath));
}

if (findings.length > 0) {
  console.error("Potential secret leakage patterns found:");
  for (const finding of findings) {
    console.error(`- ${finding.file}:${finding.line} [${finding.rule}] ${finding.text}`);
  }
  process.exit(1);
}

console.log("ci-secret-scan: no potential hardcoded secrets detected.");
