import { defineConfig } from "tsdown";

const env = {
  NODE_ENV: "production",
};

export default defineConfig([
  {
    entry: "src/index.ts",
    env,
    fixedExtension: false,
    platform: "node",
  },
  {
    entry: "src/entry.ts",
    env,
    fixedExtension: false,
    platform: "node",
  },
  {
    entry: "src/infra/warning-filter.ts",
    env,
    fixedExtension: false,
    platform: "node",
  },
  {
    entry: "src/plugin-sdk/index.ts",
    outDir: "dist/plugin-sdk",
    env,
    fixedExtension: false,
    platform: "node",
  },
  {
    entry: "src/extensionAPI.ts",
    env,
    fixedExtension: false,
    platform: "node",
  },
  {
    entry: "src/hooks/bundled/boot-md/handler.ts",
    env,
    fixedExtension: false,
    platform: "node",
  },
  {
    entry: "src/hooks/bundled/command-logger/handler.ts",
    env,
    fixedExtension: false,
    platform: "node",
  },
  {
    entry: "src/hooks/bundled/session-memory/handler.ts",
    env,
    fixedExtension: false,
    platform: "node",
  },
  {
    entry: "src/hooks/bundled/soul-evil/handler.ts",
    env,
    fixedExtension: false,
    platform: "node",
  },
  {
    entry: "src/hooks/llm-slug-generator.ts",
    env,
    fixedExtension: false,
    platform: "node",
  },
]);
