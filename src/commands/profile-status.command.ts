import { profileService } from "../profiles/profile.service.js";

function displayDate(value: string | null): string {
  return value === null ? "-" : value.replace("T", " ").slice(0, 16);
}

export async function profileStatusCommand(name: string, write: (line: string) => void = console.log): Promise<void> {
  const { profile, stateFilePresent } = await profileService.status(name);
  write(`Profile: ${profile.name}`);
  write(`Mode: ${profile.mode}`);
  write(`State file: ${stateFilePresent ? "present" : "absent"}`);
  write(`Auth status: ${profile.auth.status}`);
  write(`Last login: ${displayDate(profile.auth.lastLoginAt)}`);
  write(`Last verified: ${displayDate(profile.auth.lastVerifiedAt)}`);
  write(`Start URL: ${profile.startUrl}`);
}
