import { describe, expect, it } from "vitest";
import { applyLegacyMigrations } from "./legacy.js";

describe("Legacy Config Migration Validity", () => {
  it("should successfully migrate a known obsolete shape (gateway.token)", () => {
    const obsoleteConfig = {
      gateway: {
        token: "my-legacy-token",
        mode: "local"
      }
    };
    
    // Simulate migration
    const result = applyLegacyMigrations(obsoleteConfig);
    
    // Verify migration worked as intended
    expect(result.changes.length).toBeGreaterThan(0);
    expect(result.next?.gateway?.auth?.token).toBe("my-legacy-token");
  });

  it("should successfully migrate providers -> channels", () => {
    const obsoleteConfig = {
      whatsapp: {
        someKey: "value"
      }
    };
    
    const result = applyLegacyMigrations(obsoleteConfig);
    expect(result.changes.length).toBeGreaterThan(0);
    expect(result.next?.channels?.whatsapp?.someKey).toBe("value");
  });

  it("should return unmodified structure if nothing is legacy", () => {
    const currentConfig = {
      gateway: {
        auth: { token: "new-token" }
      }
    };
    const result = applyLegacyMigrations(currentConfig);
    expect(result.changes).toHaveLength(0);
  });
});
