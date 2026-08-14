import { profileService } from "../profiles/profile.service.js";

export interface ProfileLoginCommandOptions {
  headless?: boolean;
  reuseState?: boolean;
}

export async function profileLoginCommand(name: string, options: ProfileLoginCommandOptions): Promise<void> {
  await profileService.login(name, options);
  console.log(`Authentication state saved for profile: ${name}`);
}
