# Browser Vault

A local-first credential-store for reusable Playwright browser state. Operators can log in interactively once; agent code opens isolated contexts from saved state when it is available, without handling passwords.

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

A profile stores one browser-state snapshot, which can include sessions for multiple sites (for example, GitHub, Google, and Bitbucket). `openProfile()` does not require saved authentication: a new profile opens an empty, isolated context. Run `profile login` when you want to save reusable browser sessions.

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

### Open profiles in Docker/noVNC

`bv open` runs each headed browser in its own temporary Docker container, X display, and noVNC endpoint. A profile may have saved sessions or no state at all; the selected profile is mounted read-only, so closing the session cannot update its canonical authentication state.

```bash
npm run build
npm link
npm run docker:build

bv open personal # opens the profile's configured start URL
bv open company https://example.com # optionally override the start URL; automatically uses the next free port
```

Open the printed local URL (for example, [http://127.0.0.1:6081/vnc.html?autoconnect=true&resize=scale](http://127.0.0.1:6081/vnc.html?autoconnect=true&resize=scale)) for the corresponding session. Each `bv open` remains in the foreground; press Ctrl-C in that terminal to close only that session and release its port. `bv open` starts at port `6080` and automatically selects the next free local port. Use `--port` to choose a different starting port.

Every session prints an ID. To clean up an orphaned session from another terminal, run `bv close <session-id>`; `bv close` stops every active Browser Vault noVNC session.

### Interactive Docker login through noVNC

For a one-off Dockerized login, mount the vault read-write explicitly while starting the noVNC container:

```bash
npm run docker:build
docker compose --profile vnc run --rm --service-ports \
  -v "$(pwd)/data:/vault" browser-vault-vnc profile login github
```

Open [http://127.0.0.1:6080/vnc.html?autoconnect=true&resize=scale](http://127.0.0.1:6080/vnc.html?autoconnect=true&resize=scale), complete login in Chromium, then return to the terminal and press Enter to save the state. The noVNC service exits when the login command completes.

noVNC has no password because its port is bound to `127.0.0.1`. Do not change that binding to a network-accessible address without adding an authenticated, encrypted access layer: the display can reveal credentials and active sessions.

## Development

```bash
npm run typecheck
npm test
npm run build
npm run example:github -- github
```

The repository's source specification is [`SPEC.md`](SPEC.md). The amended planning documents in the brain repository are authoritative when they differ. Current Definition-of-Done evidence and environment blockers are recorded in [`VALIDATION.md`](VALIDATION.md).
