import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
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

beforeEach(async () => {
  vaultHome = await mkdtemp(path.join(tmpdir(), "browser-vault-command-"));
});

afterEach(async () => removeDirRecursive(vaultHome));

describe("profile commands", () => {
  it("creates, lists, and reports an unauthenticated profile without fabricating state", async () => {
    const created = await runCli("profile", "create", "github", "--start-url", "https://github.com/login");
    expect(created.exitCode).toBe(0);
    expect(created.output).toContain("Created profile: github");

    const duplicate = await runCli("profile", "create", "github", "--start-url", "https://github.com/login");
    expect(duplicate.exitCode).not.toBe(0);

    const list = await runCli("profile", "list");
    expect(list.exitCode).toBe(0);
    expect(list.output).toContain("NAME");
    expect(list.output).toContain("github");

    const status = await runCli("profile", "status", "github");
    expect(status.exitCode).toBe(0);
    expect(status.output).toContain("Profile: github");
    expect(status.output).toContain("State file: absent");
    expect(status.output).not.toMatch(/cookie|token|authorization|password/i);

    expect((await runCli("profile", "create", "../evil", "--start-url", "https://example.com")).exitCode).not.toBe(0);
  });
});
