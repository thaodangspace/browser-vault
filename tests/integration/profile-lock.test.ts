import { mkdir } from "node:fs/promises";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { profileDir } from "../../src/config/paths.js";
import { withProfileLock } from "../../src/locks/profile-lock.js";
import { ProfileLockedError } from "../../src/utils/errors.js";
import { removeDirRecursive } from "../../src/utils/filesystem.js";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const tsxCli = path.join(projectRoot, "node_modules", "tsx", "dist", "cli.mjs");
const lockOptions = { stale: 2_000, retries: 0 };
let vaultHome: string;
const children: ChildProcess[] = [];

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function waitForExit(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
  return new Promise((resolve) => child.once("exit", () => resolve()));
}

async function startLockHolder(holdMs: number, crashAfterMs?: number): Promise<ChildProcess> {
  const arguments_ = [tsxCli, "tests/fixtures/lock-holder.ts", "fixture", String(holdMs)];
  if (crashAfterMs !== undefined) arguments_.push(String(crashAfterMs));
  const child = spawn(process.execPath, arguments_, {
    cwd: projectRoot,
    env: { ...process.env, BROWSER_VAULT_HOME: vaultHome },
    stdio: ["ignore", "pipe", "pipe"],
  });
  children.push(child);

  await new Promise<void>((resolve, reject) => {
    let stderr = "";
    child.stderr?.on("data", (chunk) => (stderr += chunk));
    child.stdout?.on("data", (chunk) => {
      if (chunk.toString().includes("locked")) resolve();
    });
    child.once("error", reject);
    child.once("exit", (code) => reject(new Error(`Lock holder exited before acquiring the lock (code ${code}): ${stderr}`)));
  });
  return child;
}

beforeEach(async () => {
  vaultHome = await mkdtemp(path.join(tmpdir(), "browser-vault-lock-"));
  process.env.BROWSER_VAULT_HOME = vaultHome;
  await mkdir(profileDir("fixture"), { recursive: true });
});

afterEach(async () => {
  for (const child of children.splice(0)) {
    // Tests await normal exit; this only prevents a failed test from leaking a child.
    try {
      if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
    } catch {
      // Some sandboxed runners prohibit a parent from signalling its children.
    }
  }
  delete process.env.BROWSER_VAULT_HOME;
  await removeDirRecursive(vaultHome);
});

describe("withProfileLock", () => {
  it("rejects a second process while a profile lock is held", async () => {
    const holder = await startLockHolder(3_000);

    await expect(withProfileLock("fixture", async () => undefined, lockOptions)).rejects.toBeInstanceOf(ProfileLockedError);
    await waitForExit(holder);
  });

  it("allows acquisition after a SIGKILLed owner's stale lock expires", async () => {
    const holder = await startLockHolder(10_000, 100);
    await waitForExit(holder);
    // proper-lockfile probes timestamp precision by setting an mtime up to one
    // second ahead of wall time, so wait beyond stale + that safety margin.
    await wait(3_500);

    await expect(withProfileLock("fixture", async () => "acquired", lockOptions)).resolves.toBe("acquired");
  });

  it("does not steal a live lock held past the stale threshold", async () => {
    const holder = await startLockHolder(4_000);
    await wait(2_500);

    await expect(withProfileLock("fixture", async () => undefined, lockOptions)).rejects.toBeInstanceOf(ProfileLockedError);
    await waitForExit(holder);
  });

  it("releases locks after successful and throwing callbacks", async () => {
    await withProfileLock("fixture", async () => undefined, lockOptions);
    await expect(withProfileLock("fixture", async () => {
      throw new Error("expected callback failure");
    }, lockOptions)).rejects.toThrow("expected callback failure");

    await expect(withProfileLock("fixture", async () => "reacquired", lockOptions)).resolves.toBe("reacquired");
  });
});
