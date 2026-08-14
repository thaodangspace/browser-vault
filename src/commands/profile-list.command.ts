import { profileService } from "../profiles/profile.service.js";

function displayDate(value: string | null): string {
  return value === null ? "-" : value.replace("T", " ").slice(0, 16);
}

export async function listProfilesCommand(write: (line: string) => void = console.log): Promise<void> {
  const profiles = await profileService.list();
  write(`${"NAME".padEnd(16)}${"MODE".padEnd(18)}${"STATUS".padEnd(11)}LAST VERIFIED`);
  for (const profile of profiles) {
    write(`${profile.name.padEnd(16)}${profile.mode.padEnd(18)}${profile.auth.status.padEnd(11)}${displayDate(profile.auth.lastVerifiedAt)}`);
  }
}
