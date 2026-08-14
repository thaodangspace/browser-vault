import { access, mkdtemp } from "node:fs/promises";
import { spawn } from "node:child_process";
import { constants } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { profileDir } from "../../src/config/paths.js";
import { withProfileLock } from "../../src/locks/profile-lock.js";
import { removeDirRecursive } from "../../src/utils/filesystem.js";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const tsxCli = path.join(projectRoot, "node_modules", "tsx", "dist", "cli.mjs");
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

async function createProfile(name = "github"): Promise<void> {
  const result = await runCli("profile", "create", name, "--start-url", "https://github.com/login");
  expect(result.exitCode).toBe(0);
}

async function exists(directoryPath: string): Promise<boolean> {
  try {
    await access(directoryPath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

beforeEach(async () => {
  vaultHome = await mkdtemp(path.join(tmpdir(), "browser-vault-delete-"));
  process.env.BROWSER_VAULT_HOME = vaultHome;
});

afterEach(async () => {
  delete process.env.BROWSER_VAULT_HOME;
  await removeDirRecursive(vaultHome);
});

describe("profile delete", () => {
  it("refuses an unconfirmed non-interactive deletion and deletes with --yes", async () => {
    await createProfile();

    const unconfirmed = await runCli("profile", "delete", "github");
    expect(unconfirmed.exitCode).not.toBe(0);
    expect(await exists(profileDir("github"))).toBe(true);

    const deleted = await runCli("profile", "delete", "github", "--yes");
    expect(deleted.exitCode).toBe(0);
    expect(deleted.output).toContain("Deleted profile: github");
    expect(deleted.output).not.toMatch(/cookie|token|authorization|password/i);
    expect(await exists(profileDir("github"))).toBe(false);
  });

  it("does not delete a profile that another process has locked", async () => {
    await createProfile();

    await withProfileLock("github", async () => {
      const deleted = await runCli("profile", "delete", "github", "--yes");
      expect(deleted.exitCode).not.toBe(0);
      expect(deleted.output).toContain('Profile "github" is already in use.');
      expect(await exists(profileDir("github"))).toBe(true);
    });
  });
});
