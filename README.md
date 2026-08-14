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

Compose bind-mounts `./data` into `/vault`; authentication state is never baked into the image. Docker Compose sets `BROWSER_VAULT_HEADLESS=1` for normal headless workloads.

### Open a saved profile in Docker/noVNC

Link the local CLI once, then `bv open` starts the local-only noVNC service and opens the URL in a read-only, headed profile session:

```bash
npm run build
npm link
npm run docker:build
bv open github https://asprdt.vsee.io
```

Visit [http://localhost:6080/vnc.html?autoconnect=true&resize=scale](http://localhost:6080/vnc.html?autoconnect=true&resize=scale) to view and use Chromium. Press Ctrl-C to close that browser session; noVNC remains available for another `bv open` command. Stop all browser sessions and noVNC when finished:

```bash
bv close
```

### Interactive Docker login through noVNC

The opt-in `browser-vault-vnc` service runs headed Chromium in a virtual display and exposes noVNC **only on the local machine**. To keep noVNC running between viewer and login sessions, start the service, then execute the interactive login inside it:

```bash
npm run docker:build
docker compose --profile vnc up -d browser-vault-vnc
docker compose exec browser-vault-vnc node /app/dist/cli.js profile login github
```

Open [http://localhost:6080/vnc.html?autoconnect=true&resize=scale](http://localhost:6080/vnc.html?autoconnect=true&resize=scale) in a browser, complete login in Chromium, then return to the terminal and press Enter to save the state. The noVNC listener remains available when its browser clients disconnect and after the login command completes; stop it with `docker compose --profile vnc stop browser-vault-vnc`.

For a one-off login instead, use `docker compose --profile vnc run --rm --service-ports browser-vault-vnc profile login github`. `--service-ports` is required because `docker compose run` does not otherwise publish the service port.

noVNC has no password because its port is bound to `127.0.0.1`. Do not change that binding to a network-accessible address without adding an authenticated, encrypted access layer: the display can reveal credentials and active sessions.

## Development

```bash
npm run typecheck
npm test
npm run build
npm run example:github -- github
```

The repository's source specification is [`SPEC.md`](SPEC.md). The amended planning documents in the brain repository are authoritative when they differ. Current Definition-of-Done evidence and environment blockers are recorded in [`VALIDATION.md`](VALIDATION.md).
