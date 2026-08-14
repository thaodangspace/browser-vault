import { createInterface } from "node:readline/promises";
import { profileService } from "../profiles/profile.service.js";
import { VaultError } from "../utils/errors.js";
import { logger } from "../utils/logger.js";

export interface DeleteProfileOptions {
  yes?: boolean;
}

async function confirmDeletion(name: string): Promise<boolean> {
  if (!process.stdin.isTTY) {
    throw new VaultError(`Refusing to delete profile "${name}" without --yes in a non-interactive terminal.`);
  }

  const readline = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await readline.question(`Delete profile "${name}" and all saved authentication data? [y/N] `);
    return /^(y|yes)$/i.test(answer.trim());
  } finally {
    readline.close();
  }
}

export async function deleteProfileCommand(name: string, options: DeleteProfileOptions, write: (line: string) => void = console.log): Promise<void> {
  if (!options.yes && !(await confirmDeletion(name))) {
    write("Profile deletion cancelled.");
    return;
  }

  await profileService.delete(name);
  logger.info({ event: "profile_delete", profile: name }, "Profile deleted");
  write(`Deleted profile: ${name}`);
}
