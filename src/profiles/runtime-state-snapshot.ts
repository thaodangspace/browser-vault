import { chmod, copyFile, mkdtemp } from "node:fs/promises";
import path from "node:path";
import { runtimeDir, storageStatePath } from "../config/paths.js";
import { InvalidProfileNameError, NoAuthStateError } from "../utils/errors.js";
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
 * Creates a private, disposable copy of a profile's canonical storage state.
 * The copy is deliberately outside the profile directory so child processes
 * cannot overwrite canonical credentials through the exported path.
 */
export async function createRuntimeStateSnapshot(profileName: string): Promise<RuntimeStateSnapshot> {
  validateName(profileName);

  const canonicalStatePath = storageStatePath(profileName);
  if (!(await pathExists(canonicalStatePath))) {
    throw new NoAuthStateError(profileName);
  }

  const snapshotsDir = runtimeDir();
  await ensureDir(snapshotsDir);

  let snapshotDir: string | undefined;
  try {
    snapshotDir = await mkdtemp(path.join(snapshotsDir, "run-"));
    await chmod(snapshotDir, 0o700);

    const snapshotPath = path.join(snapshotDir, "storage-state.json");
    await copyFile(canonicalStatePath, snapshotPath);
    await chmod(snapshotPath, 0o600);

    return {
      path: snapshotPath,
      cleanup: () => removeDirRecursive(snapshotDir!),
    };
  } catch (error) {
    if (snapshotDir) await removeDirRecursive(snapshotDir);
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new NoAuthStateError(profileName);
    }
    throw error;
  }
}
