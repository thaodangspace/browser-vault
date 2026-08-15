import path from "node:path";
import type { Browser, BrowserContext } from "playwright";
import { artifactsDir, storageStatePath } from "../config/paths.js";
import { getEnvironment } from "../config/env.js";
import { profileRepository } from "../profiles/profile.repository.js";
import type { Profile } from "../profiles/profile.schema.js";
import { VaultError } from "../utils/errors.js";
import { ensureDir, pathExists } from "../utils/filesystem.js";
import { logger } from "../utils/logger.js";
import { launchChromium } from "./launch.js";

export interface OpenProfileOptions {
  headless?: boolean;
  trace?: boolean;
}

export interface OpenProfileSession {
  profile: Profile;
  browser: Browser;
  context: BrowserContext;
  close(): Promise<void>;
}

export async function openProfile(name: string, options: OpenProfileOptions = {}): Promise<OpenProfileSession> {
  const profile = await profileRepository.get(name);
  if (profile.mode !== "storage-state") {
    throw new VaultError(`Profile mode "${profile.mode}" is not implemented.`);
  }

  const statePath = storageStatePath(name);
  const hasSavedState = await pathExists(statePath);

  const traceEnabled = options.trace ?? getEnvironment().BROWSER_VAULT_ARTIFACTS;
  let tracePath: string | undefined;
  if (traceEnabled) {
    const artifactDirectory = path.join(artifactsDir(), new Date().toISOString().replace(/[:.]/g, "-"));
    await ensureDir(artifactDirectory);
    tracePath = path.join(artifactDirectory, "trace.zip");
  }

  const browser = await launchChromium({ headless: options.headless });
  try {
    const context = await browser.newContext(hasSavedState ? { storageState: statePath } : undefined);
    try {
      if (tracePath) {
        await context.tracing.start({ screenshots: true, snapshots: true, sources: true });
      }
    } catch (error) {
      await context.close().catch(() => undefined);
      throw error;
    }

    let closed = false;
    logger.info({ event: "profile_open", profile: profile.name, mode: profile.mode }, "Profile opened");
    return {
      profile,
      browser,
      context,
      async close(): Promise<void> {
        if (closed) return;
        closed = true;
        try {
          if (tracePath) await context.tracing.stop({ path: tracePath });
        } finally {
          await context.close().catch(() => undefined);
          await browser.close().catch(() => undefined);
        }
      },
    };
  } catch (error) {
    await browser.close().catch(() => undefined);
    throw error;
  }
}
