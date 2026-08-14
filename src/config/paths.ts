import path from "node:path";

export function getVaultHome(): string {
  return path.resolve(process.env.BROWSER_VAULT_HOME ?? "./data");
}

export function profilesDir(): string {
  return path.join(getVaultHome(), "profiles");
}

export function locksDir(): string {
  return path.join(getVaultHome(), "locks");
}

export function artifactsDir(): string {
  return path.join(getVaultHome(), "artifacts");
}

/** The caller must validate name with ProfileNameSchema before using this. */
export function profileDir(name: string): string {
  return path.join(profilesDir(), name);
}

/** The caller must validate name with ProfileNameSchema before using this. */
export function storageStatePath(name: string): string {
  return path.join(profileDir(name), "storage-state.json");
}

/** The caller must validate name with ProfileNameSchema before using this. */
export function profileJsonPath(name: string): string {
  return path.join(profileDir(name), "profile.json");
}
