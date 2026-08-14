import { openProfile } from "./browser/session.js";
import { profileRepository } from "./profiles/profile.repository.js";
import { AuthExpiredError, VaultError } from "./utils/errors.js";

export { openProfile, AuthExpiredError };
export const getProfile = (name: string) => profileRepository.get(name);
export const listProfiles = () => profileRepository.list();

/** Verification is added in Phase 10; callers get an explicit failure until then. */
export async function verifyProfile(_name: string): Promise<never> {
  throw new VaultError("Profile verification is not implemented yet.");
}
