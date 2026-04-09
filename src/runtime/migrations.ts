import * as fs from "fs";
import * as path from "path";

export interface SystemConfig {
  version: string;
  gateway: {
    bind: string;
    authMode: string;
  };
  [key: string]: any;
}

/**
 * Handles safe, versioned config migrations across OpenClaw updates.
 * Prevents system crash loops caused by parsing outdated JSON schemas.
 */
export class ConfigMigrator {
  private readonly latestVersion = "2026.2.9";

  public migrateConfig(configPath: string): SystemConfig {
    if (!fs.existsSync(configPath)) {
      throw new Error(`[ConfigMigrator] Config file not found at ${configPath}`);
    }

    const rawData = fs.readFileSync(configPath, "utf8");
    let config: SystemConfig = JSON.parse(rawData);

    console.log(`[ConfigMigrator] Loaded config format version: ${config.version || "legacy"}`);

    // Example pipeline for migrating legacy configs
    if (!config.version || config.version === "legacy") {
      console.log("[ConfigMigrator] Migrating from legacy -> 2026.1.0");
      config = this.migrateTo2026_1_0(config);
    }

    if (config.version === "2026.1.0") {
      console.log("[ConfigMigrator] Migrating from 2026.1.0 -> 2026.2.9");
      config = this.migrateTo2026_2_9(config);
    }

    // Write changes back to disk
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), "utf8");
    console.log(`[ConfigMigrator] Config is up to date (Format: ${this.latestVersion})`);

    return config;
  }

  private migrateTo2026_1_0(oldConfig: any): SystemConfig {
    return {
      ...oldConfig,
      version: "2026.1.0",
      gateway: {
        bind: oldConfig.bindPort ? `127.0.0.1:${oldConfig.bindPort}` : "127.0.0.1:8080",
        authMode: "strict", // New default in this version
      },
      bindPort: undefined, // clean up old key
    };
  }

  private migrateTo2026_2_9(oldConfig: any): SystemConfig {
    return {
      ...oldConfig,
      version: this.latestVersion,
      // Assume we added a unified execution timeout policy field in this version
      policy: {
        defaultTimeoutMs: 300000,
      },
    };
  }
}
