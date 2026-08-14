import path from "node:path";
import lockfile from "proper-lockfile";
import { locksDir, profileDir } from "../config/paths.js";
import { ProfileNameSchema } from "../profiles/profile.schema.js";
import { InvalidProfileNameError, ProfileLockedError, VaultError } from "../utils/errors.js";
import { ensureDir } from "../utils/filesystem.js";
import { logger } from "../utils/logger.js";

const DEFAULT_STALE_MS = 30_000;

export interface ProfileLockOptions {
  /** Defaults to 30 seconds; exposed for deterministic integration tests. */
  stale?: number;
  retries?: number;
}

function lockFilePath(name: string): string {
  return path.join(locksDir(), `${name}.lock`);
}

function validateName(name: string): void {
  if (!ProfileNameSchema.safeParse(name).success) {
    throw new InvalidProfileNameError(name);
  }
}

/**
 * Serializes mutations to one profile. The locked resource is the profile
 * directory; the lock directory is intentionally separate from credential data.
 */
export async function withProfileLock<T>(name: string, fn: () => Promise<T>, options: ProfileLockOptions = {}): Promise<T> {
  validateName(name);
  await ensureDir(locksDir());

  let compromised: VaultError | undefined;
  let release: (() => Promise<void>) | undefined;
  try {
    release = await lockfile.lock(profileDir(name), {
      lockfilePath: lockFilePath(name),
      stale: options.stale ?? DEFAULT_STALE_MS,
      retries: {
        retries: options.retries ?? 2,
        factor: 1,
        minTimeout: 50,
        maxTimeout: 100,
      },
      onCompromised: (error) => {
        compromised = new VaultError(`Profile lock for "${name}" was compromised.`, 1, { cause: error });
        logger.error({ event: "profile_lock_compromised", profile: name, error: error.message }, "Profile lock compromised");
      },
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ELOCKED") {
      throw new ProfileLockedError(name, { cause: error });
    }
    throw error;
  }

  try {
    const result = await fn();
    if (compromised) throw compromised;
    return result;
  } finally {
    if (release) {
      try {
        await release();
      } catch (error) {
        // A compromised lock may already have been released by the library.
        if ((error as NodeJS.ErrnoException).code !== "ERELEASED") throw error;
      }
    }
  }
}
