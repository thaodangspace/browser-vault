import { errors, type Page } from "playwright";
import { withProfileLock } from "../locks/profile-lock.js";
import { profileRepository } from "../profiles/profile.repository.js";
import type { Profile } from "../profiles/profile.schema.js";
import type { AuthCheck } from "../profiles/profile.types.js";
import { NoAuthStateError, ProfileNotFoundError, VaultError } from "../utils/errors.js";
import { logger } from "../utils/logger.js";
import { openProfile, type OpenProfileOptions } from "./session.js";

const VERIFY_TIMEOUT_MS = 5_000;

export class VerificationExecutionError extends VaultError {
  constructor(name: string, options?: ErrorOptions) {
    super(`Could not verify authentication for "${name}" due to an execution or network error.`, 4, options);
  }
}

function isUnambiguousLoginPage(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const pathSuggestsLogin = /\/(login|signin|sign-in|auth)(?:\/|$)/i.test(window.location.pathname);
    const hasPasswordField = document.querySelector('input[type="password"]') !== null;
    return pathSuggestsLogin || hasPasswordField;
  });
}

export async function looksLoggedOut(page: Page, profile: Profile): Promise<AuthCheck> {
  const verificationUrl = profile.auth.verify.url ?? profile.startUrl;
  await page.goto(verificationUrl, { waitUntil: "domcontentloaded", timeout: VERIFY_TIMEOUT_MS });

  if (profile.auth.verify.authenticatedSelector) {
    try {
      await page.locator(profile.auth.verify.authenticatedSelector).waitFor({ state: "visible", timeout: VERIFY_TIMEOUT_MS });
      return { status: "valid" };
    } catch (error) {
      if (error instanceof errors.TimeoutError) {
        return { status: "expired", reason: `Authenticated selector was not visible within ${VERIFY_TIMEOUT_MS}ms.` };
      }
      throw error;
    }
  }

  if (profile.auth.verify.unauthenticatedUrlPattern) {
    const pattern = new RegExp(profile.auth.verify.unauthenticatedUrlPattern);
    if (pattern.test(page.url())) {
      return { status: "expired", reason: "Final URL matches the unauthenticated URL pattern." };
    }
    return { status: "valid" };
  }

  if (await isUnambiguousLoginPage(page)) {
    return { status: "expired", reason: "Navigation reached an unambiguous login page." };
  }
  return { status: "unknown", reason: "No verification rule is configured and login evidence is ambiguous." };
}

export async function verifyProfile(name: string, options: OpenProfileOptions = {}): Promise<AuthCheck> {
  let session: Awaited<ReturnType<typeof openProfile>> | undefined;
  let result: AuthCheck;
  try {
    session = await openProfile(name, options);
    const page = await session.context.newPage();
    result = await looksLoggedOut(page, session.profile);
  } catch (error) {
    if (error instanceof ProfileNotFoundError || error instanceof NoAuthStateError || error instanceof VaultError) throw error;
    throw new VerificationExecutionError(name, { cause: error });
  } finally {
    await session?.close();
  }

  await withProfileLock(name, () => profileRepository.update(name, (profile) => ({
    ...profile,
    auth: {
      ...profile.auth,
      status: result.status,
      lastVerifiedAt: new Date().toISOString(),
    },
  })));
  logger.info({ event: "verify_result", profile: name, status: result.status }, "Profile verification complete");
  return result;
}
