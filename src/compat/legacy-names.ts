export const PROJECT_NAME = "openclaw" as const;

// OpenClaw is canonical. Keep only compatibility aliases that still exist in
// config/package migration paths; new code and docs must not introduce them.
export const LEGACY_PROJECT_NAMES = ["clawdbot"] as const;

export const MANIFEST_KEY = PROJECT_NAME;

export const LEGACY_MANIFEST_KEYS = LEGACY_PROJECT_NAMES;

export const LEGACY_PLUGIN_MANIFEST_FILENAMES = ["clawdbot.json"] as const;

export const LEGACY_CANVAS_HANDLER_NAMES = ["clawdbot"] as const;

export const MACOS_APP_SOURCES_DIR = "apps/macos/Sources/OpenClaw" as const;

export const LEGACY_MACOS_APP_SOURCES_DIRS = [] as const;
