import { access, chmod, mkdir, rm } from "node:fs/promises";
import { constants } from "node:fs";

export async function ensureDir(directoryPath: string, mode = 0o700): Promise<void> {
  await mkdir(directoryPath, { recursive: true, mode });
  await chmod(directoryPath, mode);
}

export async function pathExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

export async function removeDirRecursive(directoryPath: string): Promise<void> {
  await rm(directoryPath, { recursive: true, force: true });
}
