import { openProfile } from "./browser/session.js";
import { verifyProfile } from "./browser/verify.js";
import { profileRepository } from "./profiles/profile.repository.js";
import { AuthExpiredError } from "./utils/errors.js";

export { openProfile, verifyProfile, AuthExpiredError };
export const getProfile = (name: string) => profileRepository.get(name);
export const listProfiles = () => profileRepository.list();
