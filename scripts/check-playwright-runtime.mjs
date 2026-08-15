#!/usr/bin/env node
/**
 * Preflight check: verify that the Playwright npm version has a matching
 * Docker runtime image in the official Microsoft registry.
 *
 * Usage:
 *   node scripts/check-playwright-runtime.mjs          # preflight only
 *   node scripts/check-playwright-runtime.mjs --pull   # also attempt docker pull
 *
 * Exit 0 when the image is available (or already present).
 * Exit 1 with an actionable message on failure.
 */

import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..");

// ── helpers ────────────────────────────────────────────────────────────────

function fatal(msg) {
  console.error(msg);
  process.exit(1);
}

// ── 1. Resolve Playwright version from lockfile ────────────────────────────

let lockfile;
try {
  lockfile = JSON.parse(readFileSync(resolve(projectRoot, "package-lock.json"), "utf8"));
} catch (err) {
  fatal(`Cannot read package-lock.json: ${err.message}`);
}

const playwrightVersion = lockfile.packages?.["node_modules/playwright"]?.version;
if (!playwrightVersion) {
  fatal("Playwright is missing from package-lock.json.");
}

console.log(`Playwright package: ${playwrightVersion}`);

// ── 2. Construct expected Docker image tag ─────────────────────────────────

const IMAGE_REGISTRY = "mcr.microsoft.com";
const IMAGE_REPO = "playwright";
const IMAGE_TAG_SUFFIX = "-noble";
const expectedImage = `${IMAGE_REGISTRY}/${IMAGE_REPO}:v${playwrightVersion}${IMAGE_TAG_SUFFIX}`;

console.log(`Expected Docker image: ${expectedImage}`);

// ── 3. Verify image availability ──────────────────────────────────────────

const doPull = process.argv.includes("--pull");

function imageExistsLocally() {
  try {
    execSync(`docker image inspect "${expectedImage}" > /dev/null 2>&1`, {
      stdio: "pipe",
      timeout: 10_000,
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Attempt a lightweight registry check using `docker manifest inspect`.
 * This does not require pulling the image and bypasses most credential issues
 * for public repositories. Returns true if the manifest is resolvable.
 */
function manifestResolves() {
  try {
    execSync(`docker manifest inspect "${expectedImage}" > /dev/null 2>&1`, {
      stdio: "pipe",
      timeout: 15_000,
    });
    return true;
  } catch {
    return false;
  }
}

function ensureImageAvailable() {
  // Fast path: already cached locally.
  if (imageExistsLocally()) {
    console.log("Image status: available (cached locally)");
    return;
  }

  // Lightweight registry probe: manifest inspect.
  if (manifestResolves()) {
    console.log("Image status: available (registry resolved via manifest)");
    return;
  }

  // Full pull attempt (--pull flag or explicit test mode).
  if (doPull || process.env.BROWSER_VAULT_DOCKER_TEST === "1") {
    console.log("Manifest check inconclusive; attempting full pull…");
    try {
      execSync(`docker pull ${expectedImage}`, {
        stdio: "inherit",
        timeout: 120_000,
      });
      console.log("Image status: available (pulled successfully)");
      return;
    } catch (err) {
      const stderr = err.stderr?.toString() ?? "";
      const exitCode = err.status ?? "?";
      fatal(
        `Expected Playwright Docker image does not exist or cannot be resolved:\n  ${expectedImage}\n\nEither pin Playwright to a published Docker image version or update the runtime image strategy.\n\nError (exit ${exitCode}): ${stderr.trim().split("\n").slice(-5).join("\n")}`
      );
    }
  }

  // Default preflight: fail fast when the image cannot be verified.
  // docker:build depends on this exiting non-zero so that mismatches are
  // caught before the expensive Docker build step.
  fatal(
    `Expected Playwright Docker image is not available locally and registry resolution failed:\n  ${expectedImage}\n\nEnsure the image exists at ${IMAGE_REGISTRY}/${IMAGE_REPO}:v<version>-noble or update the runtime image strategy.`
  );
}

ensureImageAvailable();

// ── 4. Sanity-check: confirm .env.example agrees (informational) ──────────

const envExample = resolve(projectRoot, ".env.example");
try {
  const envContent = readFileSync(envExample, "utf8");
  const match = envContent.match(/PLAYWRIGHT_VERSION=(\S+)/);
  if (match && match[1] !== playwrightVersion) {
    console.warn(
      `WARNING: .env.example declares PLAYWRIGHT_VERSION=${match[1]} but package-lock.json has ${playwrightVersion}.`
    );
  }
} catch {
  // .env.example may not exist yet; ignore.
}

console.log("✓ Version check passed.");
