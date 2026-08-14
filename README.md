# Browser Vault

A local-first credential-store for reusable Playwright browser authentication. Operators log in interactively once; agent code opens isolated, authenticated contexts from the saved state without handling passwords.

> **Security warning:** `data/` is a credential store. `storage-state.json` can contain active session cookies, localStorage, and IndexedDB data. Do not commit it, print it, or copy it into Docker images. Deleting a local profile does **not** revoke the corresponding server-side session; use the website's session-management/revocation controls when a session is compromised.

## Prerequisites

- Node.js 22+
- For host-side login and browser tests: `npx playwright install chromium`
- Docker Desktop (optional; required for Docker commands)

## Quick start

```bash
npm install
npm run build

# Use ./data by default, or set BROWSER_VAULT_HOME to an absolute path.
node dist/cli.js init
node dist/cli.js profile create github --start-url https://github.com/login
node dist/cli.js profile login github
node dist/cli.js profile status github
node dist/cli.js profile verify github
```

Use the saved state from an agent:

```ts
import { openProfile } from "browser-vault";

const session = await openProfile("github");
try {
  const page = await session.context.newPage();
  await page.goto("https://github.com/");
} finally {
  await session.close(); // never writes canonical authentication state
}
```

Or wrap an existing script:

```bash
node dist/cli.js run github -- node agent.js
```

The wrapper exports `BROWSER_VAULT_PROFILE`, `BROWSER_VAULT_MODE`, and an absolute `BROWSER_VAULT_STORAGE_STATE` path to a private, disposable copy of the canonical state. Child writes affect only that copy, which is removed when the command exits. It does not provide passwords.

## Commands

```text
bv init
bv profile create <name> --start-url <url>
bv profile list
bv profile status <name>
bv profile login <name> [--reuse-state] [--headless]
bv profile verify <name>
bv profile delete <name> [--yes]
bv run <name> -- <command...>
```

Profile names must match `^[a-z0-9][a-z0-9-_]{0,63}$`.

## Environment variables

| Variable | Default | Purpose |
| --- | --- | --- |
| `BROWSER_VAULT_HOME` | `./data` | Vault root directory |
| `BROWSER_VAULT_HEADLESS` | `0` on the host; `1` in Docker Compose | Launch Chromium headlessly (`0`/`1`, `false`/`true`) |
| `BROWSER_VAULT_LOG_LEVEL` | `info` | Pino log level |
| `BROWSER_VAULT_ARTIFACTS` | `0` | Enable authenticated trace artifacts; treat them as sensitive |

## Verification exit codes

| Code | Meaning |
| --- | --- |
| `0` | Authentication is valid |
| `2` | Authentication appears expired |
| `3` | Authentication is unknown/ambiguous |
| `4` | Verification execution or network error |

## Docker

Build using the Playwright version locked in `package-lock.json`:

```bash
npm run docker:build
docker compose run --rm browser-vault profile list
```

Compose bind-mounts `./data` into `/vault`; authentication state is never baked into the image. Chromium is headed by default on the host so `bv profile login` is interactive. Docker Compose sets `BROWSER_VAULT_HEADLESS=1` for headless workloads; perform interactive login on the host. Visual observation/noVNC is not enabled by default and will be a separate opt-in mode.

## Development

```bash
npm run typecheck
npm test
npm run build
npm run example:github -- github
```

The repository's source specification is [`SPEC.md`](SPEC.md). The amended planning documents in the brain repository are authoritative when they differ. Current Definition-of-Done evidence and environment blockers are recorded in [`VALIDATION.md`](VALIDATION.md).
