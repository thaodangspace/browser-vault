import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { profileJsonPath } from "../../src/config/paths.js";
import { InvalidMetadataError, InvalidProfileNameError, ProfileNotFoundError } from "../../src/utils/errors.js";
import { removeDirRecursive } from "../../src/utils/filesystem.js";
import { ProfileRepository } from "../../src/profiles/profile.repository.js";
import type { Profile } from "../../src/profiles/profile.schema.js";

let vaultHome: string;
let repository: ProfileRepository;

beforeEach(async () => {
  vaultHome = await mkdtemp(path.join(tmpdir(), "browser-vault-profile-"));
  vi.stubEnv("BROWSER_VAULT_HOME", vaultHome);
  repository = new ProfileRepository();
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await removeDirRecursive(vaultHome);
});

function makeProfile(name = "github"): Profile {
  const now = "2026-08-14T00:00:00.000Z";
  return {
    version: 1,
    name,
    mode: "storage-state",
    startUrl: "https://github.com/login",
    createdAt: now,
    updatedAt: now,
    auth: { status: "unknown", lastLoginAt: null, lastVerifiedAt: null, verify: {} },
  };
}

describe("ProfileRepository", () => {
  it("round-trips every metadata field", async () => {
    const profile = makeProfile();
    profile.auth.verify = { url: "https://github.com/settings", authenticatedSelector: "[data-testid=user-menu]" };

    await repository.create(profile);

    expect(await repository.get("github")).toEqual(profile);
  });

  it("rejects a traversing name before constructing a path", async () => {
    await expect(repository.get("../outside")).rejects.toBeInstanceOf(InvalidProfileNameError);
    expect(await repository.exists("github")).toBe(false);
  });

  it("reports a corrupt metadata file without repairing it", async () => {
    await mkdir(path.dirname(profileJsonPath("github")), { recursive: true });
    await writeFile(profileJsonPath("github"), "{ invalid json");

    await expect(repository.get("github")).rejects.toBeInstanceOf(InvalidMetadataError);
    expect(await readFile(profileJsonPath("github"), "utf8")).toBe("{ invalid json");
  });

  it("reports a missing profile", async () => {
    await expect(repository.get("missing")).rejects.toBeInstanceOf(ProfileNotFoundError);
  });
});
