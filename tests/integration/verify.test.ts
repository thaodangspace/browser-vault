import { existsSync } from "node:fs";
import { mkdtemp, readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { chromium, type Page } from "playwright";
import { loginStorageState } from "../../src/browser/login.js";
import { storageStatePath } from "../../src/config/paths.js";
import { profileRepository } from "../../src/profiles/profile.repository.js";
import { profileService, type CreateProfileInput } from "../../src/profiles/profile.service.js";
import { removeDirRecursive } from "../../src/utils/filesystem.js";
import { startFixtureServer, type FixtureServer } from "../fixtures/auth-server.js";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const tsxCli = path.join(projectRoot, "node_modules", "tsx", "dist", "cli.mjs");
const hasChromium = existsSync(chromium.executablePath());
let fixture: FixtureServer;
let vaultHome: string;

function runCli(...arguments_: string[]): Promise<{ exitCode: number; output: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [tsxCli, "src/cli.ts", ...arguments_], {
      cwd: projectRoot,
      env: { ...process.env, BROWSER_VAULT_HOME: vaultHome },
    });
    let output = "";
    child.stdout.on("data", (chunk) => (output += chunk));
    child.stderr.on("data", (chunk) => (output += chunk));
    child.on("error", reject);
    child.on("close", (exitCode) => resolve({ exitCode: exitCode ?? 1, output }));
  });
}

async function completeFixtureLogin(page: Page): Promise<void> {
  await page.getByLabel("Username").fill("fixture-user");
  await page.getByLabel("Password").fill("fixture-password");
  await Promise.all([page.waitForURL(`${fixture.url}/dashboard`), page.getByRole("button", { name: "Sign in" }).click()]);
}

async function authenticatedProfile(name: string, options: Omit<CreateProfileInput, "name" | "startUrl"> = {}): Promise<void> {
  const profile = await profileService.create({ name, startUrl: `${fixture.url}/login`, ...options });
  await loginStorageState(profile, { headless: true, waitForConfirmation: completeFixtureLogin });
}

async function hashState(name: string): Promise<string> {
  return createHash("sha256").update(await readFile(storageStatePath(name))).digest("hex");
}

beforeAll(async () => {
  if (hasChromium) fixture = await startFixtureServer();
});

afterAll(async () => {
  await fixture?.close();
});

beforeEach(async () => {
  vaultHome = await mkdtemp(path.join(tmpdir(), "browser-vault-verify-"));
  process.env.BROWSER_VAULT_HOME = vaultHome;
});

afterEach(async () => {
  delete process.env.BROWSER_VAULT_HOME;
  await removeDirRecursive(vaultHome);
});

describe.skipIf(!hasChromium)("profile verification", () => {
  it("returns valid (exit 0) from authenticated-selector evidence without changing state", async () => {
    await authenticatedProfile("valid", { verifyUrl: `${fixture.url}/dashboard`, authenticatedSelector: '[data-testid="user-menu"]' });
    const before = await hashState("valid");

    const result = await runCli("profile", "verify", "valid");

    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("valid: valid");
    expect(await hashState("valid")).toBe(before);
    expect((await profileService.get("valid")).auth.status).toBe("valid");
  });

  it("returns expired (exit 2) from final unauthenticated URL evidence without changing state", async () => {
    await authenticatedProfile("expired", { verifyUrl: `${fixture.url}/dashboard`, unauthenticatedUrlPattern: "/login" });
    fixture.invalidateSessions();
    const before = await hashState("expired");

    const result = await runCli("profile", "verify", "expired");

    expect(result.exitCode).toBe(2);
    expect(result.output).toContain("expired: expired");
    expect(await hashState("expired")).toBe(before);
  });

  it("returns unknown (exit 3) rather than fabricating validity without a verification rule", async () => {
    await authenticatedProfile("unknown");
    const before = await hashState("unknown");

    const result = await runCli("profile", "verify", "unknown");

    expect(result.exitCode).toBe(3);
    expect(result.output).toContain("unknown: unknown");
    expect(await hashState("unknown")).toBe(before);
  });

  it("returns execution error (exit 4) for an unreachable verification target, never expired", async () => {
    await authenticatedProfile("unreachable");
    await profileRepository.update("unreachable", (profile) => ({ ...profile, startUrl: "http://127.0.0.1:1" }));
    const before = await hashState("unreachable");

    const result = await runCli("profile", "verify", "unreachable");

    expect(result.exitCode).toBe(4);
    expect(result.output).not.toContain("unreachable: expired");
    expect(await hashState("unreachable")).toBe(before);
  });
});
