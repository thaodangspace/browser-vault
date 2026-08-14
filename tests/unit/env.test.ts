import { afterEach, describe, expect, it, vi } from "vitest";
import { getEnvironment } from "../../src/config/env.js";

const chromiumLaunch = vi.hoisted(() => vi.fn());

vi.mock("playwright", () => ({
  chromium: {
    launch: chromiumLaunch,
    executablePath: vi.fn(),
  },
}));

import { launchChromium } from "../../src/browser/launch.js";

afterEach(() => {
  chromiumLaunch.mockReset();
  vi.unstubAllEnvs();
});

describe("environment configuration", () => {
  it.each([
    ["1", true],
    ["true", true],
    ["0", false],
    ["false", false],
  ])("parses BROWSER_VAULT_HEADLESS=%s as %s", (value, expected) => {
    expect(getEnvironment({ BROWSER_VAULT_HEADLESS: value }).BROWSER_VAULT_HEADLESS).toBe(expected);
  });

  it("lets an explicit Chromium option override the environment", async () => {
    vi.stubEnv("BROWSER_VAULT_HEADLESS", "1");
    chromiumLaunch.mockResolvedValue({});

    await launchChromium({ headless: false });

    expect(chromiumLaunch).toHaveBeenCalledWith({ headless: false });
  });
});
