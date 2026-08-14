import { existsSync } from "node:fs";
import { mkdtemp, readdir, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { chromium, type Page } from "playwright";
import { loginStorageState } from "../../src/browser/login.js";
import { profileDir, storageStatePath } from "../../src/config/paths.js";
import { profileService } from "../../src/profiles/profile.service.js";
import type { Profile } from "../../src/profiles/profile.schema.js";
import { ProfileLockedError } from "../../src/utils/errors.js";
import { removeDirRecursive } from "../../src/utils/filesystem.js";
import { startFixtureServer, type FixtureServer } from "../fixtures/auth-server.js";

let fixture: FixtureServer;
let vaultHome: string;

async function completeFixtureLogin(page: Page): Promise<void> {
  await page.getByLabel("Username").fill("fixture-user");
  await page.getByLabel("Password").fill("fixture-password");
  await Promise.all([page.waitForURL(`${fixture.url}/dashboard`), page.getByRole("button", { name: "Sign in" }).click()]);
  await page.waitForFunction(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("fixture-auth-db");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const transaction = database.transaction("state", "readonly");
    const value = await new Promise<unknown>((resolve, reject) => {
      const request = transaction.objectStore("state").get("login");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    return value === "fixture-indexeddb-value";
  });
}

async function createProfile(name: string): Promise<Profile> {
  return profileService.create({ name, startUrl: `${fixture.url}/login` });
}

beforeAll(async () => {
  if (hasChromium) fixture = await startFixtureServer();
});

afterAll(async () => {
  await fixture?.close();
});

beforeEach(async () => {
  vaultHome = await mkdtemp(path.join(tmpdir(), "browser-vault-login-"));
  process.env.BROWSER_VAULT_HOME = vaultHome;
});

afterEach(async () => {
  delete process.env.BROWSER_VAULT_HOME;
  await removeDirRecursive(vaultHome);
});

const hasChromium = existsSync(chromium.executablePath());

describe.skipIf(!hasChromium)("interactive login storage state", () => {
  it("atomically captures cookies and IndexedDB, then records the login time", async () => {
    const profile = await createProfile("fixture");

    await loginStorageState(profile, { headless: true, waitForConfirmation: completeFixtureLogin });

    const statePath = storageStatePath("fixture");
    const state = JSON.parse(await readFile(statePath, "utf8"));
    expect((await stat(statePath)).mode & 0o777).toBe(0o600);
    expect(state.cookies.some((cookie: { name: string }) => cookie.name === "fixture_session")).toBe(true);
    expect(JSON.stringify(state)).toContain("fixture-indexeddb-value");
    expect((await profileService.get("fixture")).auth.lastLoginAt).not.toBeNull();
  });

  it("does not create state or a temporary file when confirmation aborts", async () => {
    const profile = await createProfile("aborted");

    await expect(loginStorageState(profile, {
      headless: true,
      waitForConfirmation: async () => {
        throw new Error("operator aborted");
      },
    })).rejects.toThrow("operator aborted");

    expect(await readdir(profileDir("aborted"))).not.toContain("storage-state.json");
    expect((await readdir(profileDir("aborted"))).filter((entry) => entry.includes(".tmp-")).length).toBe(0);
  });

  it("rejects a concurrent login attempt while the first holds the profile lock", async () => {
    const profile = await createProfile("concurrent");
    let allowFirstLogin!: () => void;
    const firstMayFinish = new Promise<void>((resolve) => (allowFirstLogin = resolve));
    let firstReachedConfirmation!: () => void;
    const firstReached = new Promise<void>((resolve) => (firstReachedConfirmation = resolve));

    const firstLogin = loginStorageState(profile, {
      headless: true,
      waitForConfirmation: async (page) => {
        firstReachedConfirmation();
        await firstMayFinish;
        await completeFixtureLogin(page);
      },
    });
    await firstReached;

    await expect(loginStorageState(profile, { headless: true, waitForConfirmation: completeFixtureLogin })).rejects.toBeInstanceOf(ProfileLockedError);
    allowFirstLogin();
    await firstLogin;
  });
});
