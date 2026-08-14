import { artifactsDir, getVaultHome, locksDir, profilesDir } from "../config/paths.js";
import { ensureDir } from "../utils/filesystem.js";

export async function initializeVault(write: (line: string) => void = console.log): Promise<void> {
  await Promise.all([ensureDir(profilesDir()), ensureDir(locksDir()), ensureDir(artifactsDir())]);
  write("Browser Vault initialized");
  write(`Home: ${getVaultHome()}`);
}
