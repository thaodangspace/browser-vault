import { mkdtemp, readFile, readdir } from "node:fs/promises";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runtimeDir, storageStatePath } from "../../src/config/paths.js";
import { profileService } from "../../src/profiles/profile.service.js";
import { atomicWriteJson } from "../../src/utils/atomic-write.js";
import { pathExists, removeDirRecursive } from "../../src/utils/filesystem.js";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const tsxCli = path.join(projectRoot, "node_modules", "tsx", "dist", "cli.mjs");
let vaultHome: string;

interface CliResult {
  exitCode: number;
  output: string;
}

function startCli(...arguments_: string[]) {
  const child = spawn(process.execPath, [tsxCli, "src/cli.ts", ...arguments_], {
    cwd: projectRoot,
    env: { ...process.env, BROWSER_VAULT_HOME: vaultHome },
  });
  let output = "";
  let resolveChildOutput: (output: Record<string, unknown>) => void;
  const childOutput = new Promise<Record<string, unknown>>((resolve) => (resolveChildOutput = resolve));
  const appendOutput = (chunk: Buffer) => {
    output += chunk;
    const line = output.split("\n").find((entry) => entry.startsWith("{"));
    if (line) resolveChildOutput(JSON.parse(line));
  };
  child.stdout.on("data", appendOutput);
  child.stderr.on("data", appendOutput);
  const result = new Promise<CliResult>((resolve, reject) => {
    child.on("error", reject);
    child.on("close", (exitCode) => resolve({ exitCode: exitCode ?? 1, output }));
  });

  return { child, childOutput, result };
}

function runCli(...arguments_: string[]): Promise<CliResult> {
  return startCli(...arguments_).result;
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
  it("exports a disposable state snapshot that a child can overwrite without changing canonical state", async () => {
    await createAuthenticatedProfile();
    const before = await hashState("fixture");

    const result = await runCli("run", "fixture", "--", process.execPath, "tests/fixtures/child-agent.mjs", "overwrite");
    const childOutput = JSON.parse(result.output.split("\n").find((line) => line.startsWith("{")) ?? "{}");

    expect(result.exitCode).toBe(0);
    expect(childOutput).toMatchObject({
      profile: "fixture",
      mode: "storage-state",
      stateExists: true,
      stateWasOverwritten: true,
    });
    expect(path.isAbsolute(childOutput.statePath)).toBe(true);
    expect(childOutput.statePath).not.toBe(storageStatePath("fixture"));
    expect(childOutput.statePath.startsWith(`${runtimeDir()}${path.sep}`)).toBe(true);
    expect(await pathExists(childOutput.statePath)).toBe(false);
    expect(await hashState("fixture")).toBe(before);
  });

  it("cleans the snapshot after a non-zero child exit while preserving its exit code", async () => {
    await createAuthenticatedProfile();

    const result = await runCli("run", "fixture", "--", process.execPath, "tests/fixtures/child-agent.mjs", "42");
    const childOutput = JSON.parse(result.output.split("\n").find((line) => line.startsWith("{")) ?? "{}");

    expect(result.exitCode).toBe(42);
    expect(await pathExists(childOutput.statePath)).toBe(false);
  });

  it("cleans the snapshot when spawning the child fails", async () => {
    await createAuthenticatedProfile();

    const result = await runCli("run", "fixture", "--", "browser-vault-command-that-does-not-exist");

    expect(result.exitCode).not.toBe(0);
    expect(await readdir(runtimeDir())).toEqual([]);
  });

  it("cleans the snapshot when the running command receives SIGTERM", async () => {
    await createAuthenticatedProfile();
    const running = startCli("run", "fixture", "--", process.execPath, "tests/fixtures/child-agent.mjs", "wait");
    const childOutput = await running.childOutput;

    running.child.kill("SIGTERM");
    const result = await running.result;

    expect(result.exitCode).not.toBe(0);
    expect(await pathExists(childOutput.statePath as string)).toBe(false);
  });

  it("gives concurrent runs independent snapshots", async () => {
    await createAuthenticatedProfile();
    const before = await hashState("fixture");

    const [first, second] = await Promise.all([
      runCli("run", "fixture", "--", process.execPath, "tests/fixtures/child-agent.mjs", "overwrite"),
      runCli("run", "fixture", "--", process.execPath, "tests/fixtures/child-agent.mjs", "overwrite"),
    ]);
    const outputs = [first, second].map(({ output }) =>
      JSON.parse(output.split("\n").find((line) => line.startsWith("{")) ?? "{}"),
    );

    expect([first.exitCode, second.exitCode]).toEqual([0, 0]);
    expect(outputs.map((output) => output.stateWasOverwritten)).toEqual([true, true]);
    expect(new Set(outputs.map((output) => output.statePath)).size).toBe(2);
    expect(await Promise.all(outputs.map((output) => pathExists(output.statePath)))).toEqual([false, false]);
    expect(await hashState("fixture")).toBe(before);
  });

  it("fails before spawning for missing profiles", async () => {
    const missing = await runCli("run", "missing", "--", process.execPath, "-e", "process.exit(0)");

    expect(missing.exitCode).not.toBe(0);
    expect(missing.output).toContain('Profile "missing" does not exist.');
  });

  it("runs an unauthenticated profile with an empty disposable state", async () => {
    await profileService.create({ name: "no-state", startUrl: "https://example.com/login" });

    const result = await runCli("run", "no-state", "--", process.execPath, "tests/fixtures/child-agent.mjs", "overwrite");
    const childOutput = JSON.parse(result.output.split("\n").find((line) => line.startsWith("{")) ?? "{}");

    expect(result.exitCode).toBe(0);
    expect(childOutput).toMatchObject({ profile: "no-state", stateExists: true, stateWasOverwritten: true });
    expect(await pathExists(storageStatePath("no-state"))).toBe(false);
    expect(await readdir(runtimeDir())).toEqual([]);
  });
});
