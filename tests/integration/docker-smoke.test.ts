import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const lockfile = JSON.parse(readFileSync(path.join(projectRoot, "package-lock.json"), "utf8")) as {
  packages: Record<string, { version?: string }>;
};
const playwrightVersion = lockfile.packages["node_modules/playwright"]?.version;
if (!playwrightVersion) throw new Error("Playwright is missing from package-lock.json");

function dockerIsAvailable(): boolean {
  try {
    execFileSync("docker", ["info"], { stdio: "ignore", timeout: 10_000 });
    return true;
  } catch {
    return false;
  }
}

// Building pulls a large browser image; opt in for hosts with a working Docker
// daemon and registry credentials. It is otherwise skipped with the suite.
const dockerAvailable = process.env.BROWSER_VAULT_DOCKER_TEST === "1" && dockerIsAvailable();

describe.skipIf(!dockerAvailable)("Docker image", () => {
  it("builds, reads the bind-mounted vault, and launches Chromium", () => {
    const environment = { ...process.env, PLAYWRIGHT_VERSION: playwrightVersion };
    execFileSync("docker", ["compose", "build"], { cwd: projectRoot, env: environment, stdio: "inherit", timeout: 300_000 });

    const listOutput = execFileSync("docker", ["compose", "run", "--rm", "browser-vault", "profile", "list"], {
      cwd: projectRoot,
      env: environment,
      encoding: "utf8",
      timeout: 60_000,
    });
    expect(listOutput).toContain("NAME");

    execFileSync("docker", ["compose", "run", "--rm", "--entrypoint", "node", "browser-vault", "-e", "import('playwright').then(async ({ chromium }) => { const browser = await chromium.launch({ headless: true }); await browser.close(); })"], {
      cwd: projectRoot,
      env: environment,
      stdio: "inherit",
      timeout: 60_000,
    });
  }, 360_000);
});
