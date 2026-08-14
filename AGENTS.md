# Browser Vault contributor guide

## Module layering

Keep dependencies flowing from `config` → `utils` → `profiles` → `locks` → `browser` → `commands`. Commands are thin adapters; validation and filesystem behavior belong in the lower layers.

## Credential-state rules

- `storage-state.json` is opaque credential material: never parse it for display, log it, or commit it.
- Agent contexts opened with `openProfile()` are read-only with respect to canonical state. `close()` must never save state.
- Canonical state writes occur only through `atomicWriteJson`: write a same-directory temporary file, fsync, chmod `0600`, then rename.
- Profile metadata and state updates must validate profile names before any path construction.

## Lock protocol

Use `withProfileLock(name, fn)` for login, state mutation, and deletion. It locks the profile directory while writing lock records in `<vault>/locks/<name>.lock`, retries only briefly, refreshes live locks, and tolerates stale crashed locks. Do not lock ordinary read-only agent sessions.

## Browser and Docker

Use Chromium only. Browser tests use the offline fixture server under `tests/fixtures/auth-server.ts`; do not make normal tests depend on external sites.

The runtime Playwright image must exactly match the `playwright` version in `package-lock.json`. Build with `npm run docker:build`, which derives `PLAYWRIGHT_VERSION` mechanically. Keep `data/` excluded by both `.gitignore` and `.dockerignore`.
