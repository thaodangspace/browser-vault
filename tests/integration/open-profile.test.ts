import { existsSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import path from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { chromium, type Page } from "playwright";
import { loginStorageState } from "../../src/browser/login.js";
import { openProfile } from "../../src/browser/session.js";
import { storageStatePath } from "../../src/config/paths.js";
import { profileService } from "../../src/profiles/profile.service.js";
import { removeDirRecursive } from "../../src/utils/filesystem.js";
import { startFixtureServer, type FixtureServer } from "../fixtures/auth-server.js";
import { readFile } from "node:fs/promises";

const hasChromium = existsSync(chromium.executablePath());
let fixture: FixtureServer;
let vaultHome: string;

async function completeFixtureLogin(page: Page): Promise<void> {
  await page.getByLabel("Username").fill("fixture-user");
  await page.getByLabel("Password").fill("fixture-password");
  await Promise.all([page.waitForURL(`${fixture.url}/dashboard`), page.getByRole("button", { name: "Sign in" }).click()]);
  await page.waitForFunction(() => indexedDB.databases().then((databases) => databases.some((database) => database.name === "fixture-auth-db")));
}

async function createAuthenticatedProfile(name = "fixture"): Promise<void> {
  const profile = await profileService.create({ name, startUrl: `${fixture.url}/login` });
  await loginStorageState(profile, { headless: true, waitForConfirmation: completeFixtureLogin });
}

async function fileHash(filePath: string): Promise<string> {
  return createHash("sha256").update(await readFile(filePath)).digest("hex");
}

beforeAll(async () => {
  if (hasChromium) fixture = await startFixtureServer();
});

afterAll(async () => {
  await fixture?.close();
});

beforeEach(async () => {
  vaultHome = await mkdtemp(path.join(tmpdir(), "browser-vault-open-"));
  process.env.BROWSER_VAULT_HOME = vaultHome;
});

afterEach(async () => {
  delete process.env.BROWSER_VAULT_HOME;
  await removeDirRecursive(vaultHome);
});

describe.skipIf(!hasChromium)("openProfile", () => {
  it("opens three isolated authenticated contexts without changing canonical state", async () => {
    await createAuthenticatedProfile();
    const before = await fileHash(storageStatePath("fixture"));

    const sessions = await Promise.all(Array.from({ length: 3 }, () => openProfile("fixture", { headless: true })));
    try {
      await Promise.all(sessions.map(async (session) => {
        const page = await session.context.newPage();
        await page.goto(`${fixture.url}/dashboard`);
        expect(await page.getByTestId("user-menu").isVisible()).toBe(true);
      }));
    } finally {
      await Promise.all(sessions.map((session) => session.close()));
    }

    expect(await fileHash(storageStatePath("fixture"))).toBe(before);
  });

  it("opens an empty context when no saved authentication state exists", async () => {
    await profileService.create({ name: "no-state", startUrl: `${fixture.url}/login` });

    const session = await openProfile("no-state", { headless: true });
    try {
      const page = await session.context.newPage();
      await page.goto(`${fixture.url}/dashboard`);
      expect(await page.getByRole("heading", { name: "Fixture login" }).isVisible()).toBe(true);
    } finally {
      await session.close();
    }
  });

  it("keeps agent context cookie mutations isolated", async () => {
    await createAuthenticatedProfile();
    const [first, second] = await Promise.all([openProfile("fixture", { headless: true }), openProfile("fixture", { headless: true })]);
    try {
      await first.context.addCookies([{ name: "agent-only", value: "1", domain: "127.0.0.1", path: "/" }]);
      expect((await first.context.cookies()).some((cookie) => cookie.name === "agent-only")).toBe(true);
      expect((await second.context.cookies()).some((cookie) => cookie.name === "agent-only")).toBe(false);
    } finally {
      await Promise.all([first.close(), second.close()]);
    }
  });
});
