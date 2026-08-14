import { mkdtemp, readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { storageStatePath } from "../../src/config/paths.js";
import { profileService } from "../../src/profiles/profile.service.js";
import { atomicWriteJson } from "../../src/utils/atomic-write.js";
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

async function createAuthenticatedProfile(name = "fixture"): Promise<void> {
  await profileService.create({ name, startUrl: "https://example.com/login" });
  await atomicWriteJson(storageStatePath(name), { cookies: [], origins: [] });
}

async function hashState(name: string): Promise<string> {
  return createHash("sha256").update(await readFile(storageStatePath(name))).digest("hex");
}

beforeEach(async () => {
  vaultHome = await mkdtemp(path.join(tmpdir(), "browser-vault-run-"));
  process.env.BROWSER_VAULT_HOME = vaultHome;
});

afterEach(async () => {
  delete process.env.BROWSER_VAULT_HOME;
  await removeDirRecursive(vaultHome);
});

describe("bv run", () => {
  it("exports only resolved profile-state metadata and preserves canonical state", async () => {
    await createAuthenticatedProfile();
    const before = await hashState("fixture");

    const result = await runCli("run", "fixture", "--", process.execPath, "tests/fixtures/child-agent.mjs");
    const childOutput = JSON.parse(result.output.split("\n").find((line) => line.startsWith("{")) ?? "{}");

    expect(result.exitCode).toBe(0);
    expect(childOutput).toEqual({
      profile: "fixture",
      mode: "storage-state",
      statePath: storageStatePath("fixture"),
      stateExists: true,
    });
    expect(path.isAbsolute(childOutput.statePath)).toBe(true);
    expect(await hashState("fixture")).toBe(before);
  });

  it("propagates the child exit code verbatim", async () => {
    await createAuthenticatedProfile();

    const result = await runCli("run", "fixture", "--", process.execPath, "-e", "process.exit(42)");

    expect(result.exitCode).toBe(42);
  });

  it("fails before spawning for missing profiles or missing state", async () => {
    const missing = await runCli("run", "missing", "--", process.execPath, "-e", "process.exit(0)");
    expect(missing.exitCode).not.toBe(0);
    expect(missing.output).toContain('Profile "missing" does not exist.');

    await profileService.create({ name: "no-state", startUrl: "https://example.com/login" });
    const noState = await runCli("run", "no-state", "--", process.execPath, "-e", "process.exit(0)");
    expect(noState.exitCode).not.toBe(0);
    expect(noState.output).toContain('Profile "no-state" has not been authenticated.');
  });
});
