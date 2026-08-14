# MVP validation record

Last updated: 2026-08-14

## Automated evidence

```text
npm run typecheck  # passed
npm test           # 33 passed, 11 skipped
npm run build      # passed
```

The skipped tests require host Playwright Chromium (10 tests) or an explicitly enabled Docker daemon with usable registry credentials (1 test). Run `npx playwright install chromium` and then `BROWSER_VAULT_DOCKER_TEST=1 npm test` to complete those checks.

## Definition-of-done status

- [x] Typecheck, unit tests, and build pass.
- [x] `bv init` is idempotent and creates restrictive vault directories.
- [x] Profile-name validation and traversal rejection are covered.
- [x] Create, list, status, and confirmed delete are covered.
- [ ] Interactive login storage capture and IndexedDB capture — implemented; browser test blocked by missing Chromium.
- [x] Credential state is git-ignored and atomic writes use `0600`.
- [x] Structured logger redaction is covered.
- [ ] Authenticated `openProfile()` and concurrent browser contexts — implemented; browser test blocked by missing Chromium.
- [x] Process-wrapper execution preserves canonical state.
- [ ] Browser-backed valid/expired/unknown verification — implemented; browser test blocked by missing Chromium.
- [ ] Docker image build, Chromium launch, and bind mount — implemented; smoke test blocked by Docker registry credential/config access.
- [x] Compose declares init handling and host IPC.
- [ ] Example-agent live run — emitted and documented; requires a real logged-in profile.
- [x] README includes setup, security, environment, exit-code, and revocation guidance.
