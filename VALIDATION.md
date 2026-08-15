# MVP validation record

Last updated: 2026-08-15

## Automated evidence

```text
npm run typecheck  # passed
npm test           # 33 passed, 11 skipped
npm run build      # passed
npm run docker:check  # passed — image mcr.microsoft.com/playwright:v1.62.1-noble verified via manifest inspect
```

### Playwright runtime version strategy

- **Single source of truth**: `package-lock.json` (Playwright `1.62.1`).
- **Docker tag derivation**: `mcr.microsoft.com/playwright:v${PLAYWRIGHT_VERSION}-noble`, where `PLAYWRIGHT_VERSION` is read mechanically from the lockfile.
- **Preflight verification**: `scripts/check-playwright-runtime.mjs` resolves the expected image tag and calls `docker manifest inspect` to confirm availability before any Docker build.
- **Build gating**: `npm run docker:build` runs `docker:check` first; the preflight exits non-zero when the expected image is neither cached locally nor resolvable via manifest inspect.
- **.env.example** mirrors the version for human reference (`PLAYWRIGHT_VERSION=1.62.1`).

The skipped tests require host Playwright Chromium (10 tests) or an explicitly enabled Docker daemon with usable registry credentials (1 test). Browser installation into the default cache is blocked by permissions on `/Users/dt/Library/Caches/ms-playwright`; installation into `/tmp/browser-vault-playwright` succeeded, but this sandbox aborts launched Chromium processes with `SIGABRT` after an `EPERM` kill failure. Run `npx playwright install chromium` and `npm test` on an unrestricted host. Run `BROWSER_VAULT_DOCKER_TEST=1 npm test` on a host with usable Docker registry credentials to complete the Docker check.

## Definition-of-done status

- [x] Typecheck, unit tests, and build pass.
- [x] `bv init` is idempotent and creates restrictive vault directories.
- [x] Profile-name validation and traversal rejection are covered.
- [x] Create, list, status, and confirmed delete are covered.
- [ ] Interactive login storage capture and IndexedDB capture — implemented; browser launch is blocked by this sandbox's process permissions.
- [x] Credential state is git-ignored and atomic writes use `0600`.
- [x] Structured logger redaction is covered.
- [ ] Authenticated `openProfile()` and concurrent browser contexts — implemented; browser launch is blocked by this sandbox's process permissions.
- [x] Process-wrapper execution preserves canonical state.
- [ ] Browser-backed valid/expired/unknown verification — implemented; browser launch is blocked by this sandbox's process permissions.
- [x] Playwright npm/Docker version mismatch detection via `docker:check` preflight (manifest inspect).
- [ ] Docker image build, Chromium launch, and bind mount — requires a host with Docker and registry credentials; CI job (`ci.yml`) sets `BROWSER_VAULT_DOCKER_TEST=1` to enable the smoke test.
- [x] Compose declares init handling and host IPC.
- [ ] Example-agent live run — emitted and documented; requires a real logged-in profile.
- [x] README includes setup, security, environment, exit-code, and revocation guidance.
