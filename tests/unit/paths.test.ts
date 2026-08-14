import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { artifactsDir, getVaultHome, locksDir, profileJsonPath, profilesDir, runtimeDir, storageStatePath } from "../../src/config/paths.js";

afterEach(() => vi.unstubAllEnvs());

describe("vault paths", () => {
  it("resolves BROWSER_VAULT_HOME and derives vault paths", () => {
    vi.stubEnv("BROWSER_VAULT_HOME", "relative-vault");
    const home = path.resolve("relative-vault");

    expect(getVaultHome()).toBe(home);
    expect(profilesDir()).toBe(path.join(home, "profiles"));
    expect(locksDir()).toBe(path.join(home, "locks"));
    expect(artifactsDir()).toBe(path.join(home, "artifacts"));
    expect(runtimeDir()).toBe(path.join(home, "runtime"));
    expect(profileJsonPath("github")).toBe(path.join(home, "profiles", "github", "profile.json"));
    expect(storageStatePath("github")).toBe(path.join(home, "profiles", "github", "storage-state.json"));
  });
});
