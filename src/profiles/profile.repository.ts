import { readdir, readFile, mkdir, rm } from "node:fs/promises";
import { profileDir, profileJsonPath, profilesDir } from "../config/paths.js";
import { atomicWriteJson } from "../utils/atomic-write.js";
import { InvalidMetadataError, InvalidProfileNameError, ProfileExistsError, ProfileNotFoundError } from "../utils/errors.js";
import { ensureDir, pathExists } from "../utils/filesystem.js";
import { logger } from "../utils/logger.js";
import { ProfileNameSchema, ProfileSchema, type Profile } from "./profile.schema.js";

function validateName(name: string): void {
  if (!ProfileNameSchema.safeParse(name).success) {
    throw new InvalidProfileNameError(name);
  }
}

function parseMetadata(filePath: string, contents: string): Profile {
  try {
    return ProfileSchema.parse(JSON.parse(contents));
  } catch (error) {
    throw new InvalidMetadataError(filePath, { cause: error });
  }
}

export class ProfileRepository {
  async exists(name: string): Promise<boolean> {
    validateName(name);
    return pathExists(profileDir(name));
  }

  async get(name: string): Promise<Profile> {
    validateName(name);
    const metadataPath = profileJsonPath(name);
    let contents: string;
    try {
      contents = await readFile(metadataPath, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        throw new ProfileNotFoundError(name);
      }
      throw error;
    }
    return parseMetadata(metadataPath, contents);
  }

  async list(): Promise<Profile[]> {
    let entries: Array<{ name: string; isDirectory(): boolean }>;
    try {
      entries = await readdir(profilesDir(), { withFileTypes: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }

    const profiles: Profile[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory() || !ProfileNameSchema.safeParse(entry.name).success) {
        logger.warn({ event: "profile_list_skip", entry: entry.name }, "Skipping invalid profile entry");
        continue;
      }
      try {
        profiles.push(await this.get(entry.name));
      } catch (error) {
        logger.warn({ event: "profile_list_skip", entry: entry.name, error: error instanceof Error ? error.message : String(error) }, "Skipping unreadable profile metadata");
      }
    }
    return profiles.sort((left, right) => left.name.localeCompare(right.name));
  }

  async create(profile: Profile): Promise<Profile> {
    validateName(profile.name);
    const validatedProfile = ProfileSchema.parse(profile);
    const directory = profileDir(profile.name);
    await ensureDir(profilesDir());
    try {
      await mkdir(directory, { recursive: false, mode: 0o700 });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST") {
        throw new ProfileExistsError(profile.name);
      }
      throw error;
    }

    try {
      await atomicWriteJson(profileJsonPath(profile.name), validatedProfile);
      return validatedProfile;
    } catch (error) {
      await rm(directory, { recursive: true, force: true });
      throw error;
    }
  }

  async update(name: string, update: (profile: Profile) => Profile): Promise<Profile> {
    validateName(name);
    const current = await this.get(name);
    const next = ProfileSchema.parse({
      ...update(current),
      name,
      updatedAt: new Date().toISOString(),
    });
    await atomicWriteJson(profileJsonPath(name), next);
    return next;
  }

  async remove(name: string): Promise<void> {
    validateName(name);
    await this.get(name);
    await rm(profileDir(name), { recursive: true, force: true });
  }
}

export const profileRepository = new ProfileRepository();
