import { existsSync } from "node:fs";
import { chromium, type Browser } from "playwright";
import { getEnvironment } from "../config/env.js";

export interface LaunchChromiumOptions {
  headless?: boolean;
}

export async function launchChromium(options: LaunchChromiumOptions = {}): Promise<Browser> {
  const headless = options.headless ?? getEnvironment().BROWSER_VAULT_HEADLESS;
  try {
    return await chromium.launch({ headless });
  } catch (error) {
    // Recent Playwright releases prefer a separate headless-shell download. Fall
    // back to the installed Chromium bundle when that optional binary is absent.
    const executablePath = chromium.executablePath();
    if (headless && existsSync(executablePath)) {
      return chromium.launch({ headless, executablePath });
    }
    throw error;
  }
}
