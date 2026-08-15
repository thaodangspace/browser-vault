import { chmod, copyFile, mkdtemp } from "node:fs/promises";
import path from "node:path";
import { runtimeDir, storageStatePath } from "../config/paths.js";
import { InvalidProfileNameError } from "../utils/errors.js";
import { atomicWriteJson } from "../utils/atomic-write.js";
import { ensureDir, pathExists, removeDirRecursive } from "../utils/filesystem.js";
import { ProfileNameSchema } from "./profile.schema.js";

export interface RuntimeStateSnapshot {
  path: string;
  cleanup(): Promise<void>;
}

function validateName(name: string): void {
  if (!ProfileNameSchema.safeParse(name).success) {
    throw new InvalidProfileNameError(name);
  }
}

/**
 * Creates private, disposable state for a child process. It is seeded from
 * canonical state when available, or from an empty Playwright state otherwise.
 * It is deliberately outside the profile directory so child processes cannot
 * overwrite canonical credentials through the exported path.
 */
export async function createRuntimeStateSnapshot(profileName: string): Promise<RuntimeStateSnapshot> {
  validateName(profileName);

  const canonicalStatePath = storageStatePath(profileName);
  const hasCanonicalState = await pathExists(canonicalStatePath);
  const snapshotsDir = runtimeDir();
  await ensureDir(snapshotsDir);

  let snapshotDir: string | undefined;
  try {
    snapshotDir = await mkdtemp(path.join(snapshotsDir, "run-"));
    await chmod(snapshotDir, 0o700);

    const snapshotPath = path.join(snapshotDir, "storage-state.json");
    if (hasCanonicalState) {
      try {
        await copyFile(canonicalStatePath, snapshotPath);
        await chmod(snapshotPath, 0o600);
      } catch (error) {
        // A concurrent profile deletion may remove canonical state after the
        // existence check. This read-only session can safely start empty.
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        await atomicWriteJson(snapshotPath, { cookies: [], origins: [] });
      }
    } else {
      await atomicWriteJson(snapshotPath, { cookies: [], origins: [] });
    }

    return {
      path: snapshotPath,
      cleanup: () => removeDirRecursive(snapshotDir!),
    };
  } catch (error) {
    if (snapshotDir) await removeDirRecursive(snapshotDir);
    throw error;
  }
}
