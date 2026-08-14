import type { BrowserContext } from "playwright";
import { storageStatePath } from "../config/paths.js";
import { ProfileNameSchema } from "../profiles/profile.schema.js";
import { InvalidProfileNameError } from "../utils/errors.js";
import { atomicWriteJson } from "../utils/atomic-write.js";

export async function captureStorageState(context: BrowserContext) {
  return context.storageState({ indexedDB: true });
}

export async function saveStorageState(name: string, state: unknown): Promise<void> {
  if (!ProfileNameSchema.safeParse(name).success) {
    throw new InvalidProfileNameError(name);
  }
  await atomicWriteJson(storageStatePath(name), state);
}
