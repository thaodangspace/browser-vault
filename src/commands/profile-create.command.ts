import { profileService, type CreateProfileInput } from "../profiles/profile.service.js";

export async function createProfileCommand(name: string, options: Omit<CreateProfileInput, "name">, write: (line: string) => void = console.log): Promise<void> {
  const profile = await profileService.create({ name, ...options });
  write(`Created profile: ${profile.name}`);
  write(`Mode: ${profile.mode}`);
  write("Login optional: save reusable site sessions with bv profile login.");
}
