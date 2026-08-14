import { storageStatePath } from "../config/paths.js";
import { pathExists } from "../utils/filesystem.js";
import { InvalidProfileNameError } from "../utils/errors.js";
import { ProfileNameSchema, ProfileSchema, type Profile } from "./profile.schema.js";
import { ProfileRepository, profileRepository } from "./profile.repository.js";

export interface CreateProfileInput {
  name: string;
  startUrl: string;
  mode?: "storage-state" | "persistent";
  verifyUrl?: string;
  authenticatedSelector?: string;
  unauthenticatedUrlPattern?: string;
}

export class ProfileService {
  constructor(private readonly repository: ProfileRepository = profileRepository) {}

  async create(input: CreateProfileInput): Promise<Profile> {
    if (!ProfileNameSchema.safeParse(input.name).success) {
      throw new InvalidProfileNameError(input.name);
    }
    const now = new Date().toISOString();
    const profile = ProfileSchema.parse({
      version: 1,
      name: input.name,
      mode: input.mode ?? "storage-state",
      startUrl: input.startUrl,
      createdAt: now,
      updatedAt: now,
      auth: {
        status: "unknown",
        lastLoginAt: null,
        lastVerifiedAt: null,
        verify: {
          url: input.verifyUrl,
          authenticatedSelector: input.authenticatedSelector,
          unauthenticatedUrlPattern: input.unauthenticatedUrlPattern,
        },
      },
    });
    return this.repository.create(profile);
  }

  get(name: string): Promise<Profile> {
    return this.repository.get(name);
  }

  list(): Promise<Profile[]> {
    return this.repository.list();
  }

  async status(name: string): Promise<{ profile: Profile; stateFilePresent: boolean }> {
    const profile = await this.repository.get(name);
    return { profile, stateFilePresent: await pathExists(storageStatePath(name)) };
  }
}

export const profileService = new ProfileService();
