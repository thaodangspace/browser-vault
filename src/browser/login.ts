import { createInterface } from "node:readline/promises";
import type { Page } from "playwright";
import { withProfileLock } from "../locks/profile-lock.js";
import { profileRepository } from "../profiles/profile.repository.js";
import type { Profile } from "../profiles/profile.schema.js";
import { VaultError } from "../utils/errors.js";
import { logger } from "../utils/logger.js";
import { launchChromium } from "./launch.js";
import { captureStorageState, saveStorageState } from "./storage-state.js";
import { pathExists } from "../utils/filesystem.js";
import { storageStatePath } from "../config/paths.js";

export interface LoginOptions {
  headless?: boolean;
  reuseState?: boolean;
  /** Injected by callers that can drive the browser instead of waiting on a terminal. */
  waitForConfirmation?: (page: Page) => Promise<void>;
}

async function waitForTerminalConfirmation(): Promise<void> {
  if (!process.stdin.isTTY) {
    throw new VaultError("Interactive login requires a terminal. Run bv profile login from a TTY.");
  }
  const readline = createInterface({ input: process.stdin, output: process.stdout });
  try {
    await readline.question("Complete login in Chromium, then press ENTER to save authentication state. ");
  } finally {
    readline.close();
  }
}

async function waitForConfirmation(page: Page, callback: ((page: Page) => Promise<void>) | undefined): Promise<void> {
  const closed = new Promise<never>((_resolve, reject) => {
    page.context().once("close", () => reject(new VaultError("Login browser was closed before authentication state was saved.")));
  });
  const confirmation = callback ? callback(page) : waitForTerminalConfirmation();
  await Promise.race([confirmation, closed]);
}

/** Runs an interactive login, atomically saving state and metadata under one profile lock. */
export async function loginStorageState(profile: Profile, options: LoginOptions = {}): Promise<void> {
  await withProfileLock(profile.name, async () => {
    logger.info({ event: "login_start", profile: profile.name, mode: profile.mode }, "Login started");
    const browser = await launchChromium({ headless: options.headless });
    let context: Awaited<ReturnType<typeof browser.newContext>> | undefined;
    try {
      const existingState = options.reuseState && (await pathExists(storageStatePath(profile.name))) ? storageStatePath(profile.name) : undefined;
      context = await browser.newContext(existingState ? { storageState: existingState } : undefined);
      const page = await context.newPage();
      await page.goto(profile.startUrl, { waitUntil: "domcontentloaded" });
      await waitForConfirmation(page, options.waitForConfirmation);

      await saveStorageState(profile.name, await captureStorageState(context));
      await profileRepository.update(profile.name, (current) => ({
        ...current,
        auth: { ...current.auth, lastLoginAt: new Date().toISOString() },
      }));
      logger.info({ event: "login_complete", profile: profile.name, mode: profile.mode }, "Login state saved");
    } finally {
      await context?.close().catch(() => undefined);
      await browser.close().catch(() => undefined);
    }
  });
}
