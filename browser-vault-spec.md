# Browser Vault — Implementation Specification

> **Project:** `browser-vault`  
> **Purpose:** Personal browser-auth vault for Playwright-based agents  
> **Primary runtime:** Node.js + TypeScript + Playwright + Docker Compose  
> **Status:** Implementation-ready specification  
> **Scope:** Single-user / local-first. Not designed as a multi-tenant SaaS.

---

## 1. Problem statement

AI agents often need to interact with websites that require authentication. Re-running username/password/2FA login for every task is slow, fragile, and unsafe.

`browser-vault` provides a small local infrastructure layer that:

1. stores reusable authenticated browser state;
2. lets multiple agents create isolated Playwright contexts from the same login;
3. keeps authentication data outside source control;
4. supports manual re-login when a session expires;
5. optionally supports a full persistent Chromium profile for sites that cannot work reliably from Playwright `storageState`;
6. runs agent browser workloads in Docker.

The default implementation MUST use Playwright `storageState`, not a shared Chromium `userDataDir`.

Reason:

- multiple BrowserContexts can independently load the same authenticated state;
- contexts remain isolated from one another;
- agents can run concurrently;
- there is no shared Chromium-profile write lock;
- state files are easier to back up, inspect metadata for, rotate, and replace atomically.

A full persistent Chromium profile is an **optional mode** and MUST use an exclusive lock.

---

# 2. Goals

## 2.1 MVP goals

The MVP is complete when the following workflow works:

```bash
# initialize vault
bv init

# create an auth profile
bv profile create github \
  --start-url https://github.com/login

# login interactively and save auth state
bv profile login github

# verify that auth still works
bv profile verify github

# run an agent using that profile
bv run github -- node dist/examples/github-agent.js
```

The agent MUST start already authenticated without handling credentials itself.

## 2.2 Functional goals

`browser-vault` MUST support:

- named auth profiles;
- Playwright `storageState`;
- cookies;
- localStorage;
- IndexedDB capture;
- profile metadata;
- profile validity checks;
- interactive manual login;
- safe atomic state replacement;
- multiple concurrent read-only agent contexts;
- exclusive write/refresh lock;
- Docker execution;
- trace/screenshot artifacts for debugging;
- no secrets committed to Git.

## 2.3 Later goals

After MVP:

- persistent `userDataDir` profiles;
- profile leasing;
- automatic stale-session detection;
- optional browser daemon;
- optional HTTP API;
- noVNC login UI for fully Dockerized authentication;
- encrypted backup.

---

# 3. Non-goals

Do NOT implement these in the MVP:

- multi-user authentication;
- cloud-hosted credential service;
- Kubernetes;
- distributed locking;
- automatic CAPTCHA solving;
- stealth / anti-detection plugins;
- automatic 2FA bypass;
- password storage;
- arbitrary remote code execution API;
- browser farm orchestration;
- Selenium support;
- Firefox/WebKit support.

Chromium only for MVP.

---

# 4. Security model

Treat every saved browser state as a credential.

A `storage-state.json` file may contain session cookies or authentication tokens that effectively provide access to the account.

Requirements:

1. `data/` MUST be in `.gitignore`.
2. profile directories SHOULD use filesystem mode `0700`.
3. auth-state files SHOULD use mode `0600`.
4. never print cookie values or local-storage values in logs.
5. never expose the vault directory through a public HTTP server.
6. do not bind future service APIs to `0.0.0.0` by default.
7. default bind address for any API MUST be `127.0.0.1`.
8. Docker agent containers SHOULD mount only the profile/state they require.
9. normal agent execution MUST treat state as read-only.
10. writes to auth state MUST use a lock and atomic rename.

No passwords need to be stored by Browser Vault. The normal authentication workflow is manual login inside a browser.

---

# 5. Core design decision

There are two profile modes.

## 5.1 `storage-state` mode — default

Stored files:

```text
data/profiles/github/
├── profile.json
└── storage-state.json
```

When an agent runs:

```text
storage-state.json
       │
       ├───────────────┐
       │               │
       ▼               ▼
BrowserContext A   BrowserContext B
Agent A            Agent B
```

Both contexts start with the same authentication snapshot but have independent in-memory state.

Agent changes MUST NOT automatically overwrite the canonical state.

This means multiple agents may use the same saved login concurrently.

## 5.2 `persistent` mode — fallback

Stored files:

```text
data/profiles/google-main/
├── profile.json
└── user-data/
```

Execution:

```ts
chromium.launchPersistentContext(userDataDir)
```

Only one process may own a persistent profile at a time.

Therefore:

```text
Agent A ── acquire lock ── persistent profile
Agent B ── waits/fails while lock exists
```

Do not use the user's normal Chrome profile.

Always create a dedicated Browser Vault automation profile.

---

# 6. Technology choices

Use:

```text
Node.js
TypeScript
Playwright
Commander
Zod
proper-lockfile
Pino
Vitest
Docker
Docker Compose
```

Recommended package responsibilities:

| Package | Purpose |
|---|---|
| `playwright` | Chromium automation |
| `commander` | CLI |
| `zod` | config/profile validation |
| `proper-lockfile` | filesystem locks |
| `pino` | structured logging |
| `vitest` | tests |
| `tsx` | local TypeScript development |
| `typescript` | build |

Do not add a database in the MVP.

The filesystem is the source of truth.

---

# 7. Repository layout

Create:

```text
browser-vault/
├── README.md
├── SPEC.md
├── package.json
├── package-lock.json
├── tsconfig.json
├── vitest.config.ts
├── Dockerfile
├── compose.yaml
├── .dockerignore
├── .gitignore
├── .env.example
│
├── src/
│   ├── cli.ts
│   ├── index.ts
│   │
│   ├── config/
│   │   ├── paths.ts
│   │   └── env.ts
│   │
│   ├── profiles/
│   │   ├── profile.schema.ts
│   │   ├── profile.repository.ts
│   │   ├── profile.service.ts
│   │   └── profile.types.ts
│   │
│   ├── browser/
│   │   ├── launch.ts
│   │   ├── login.ts
│   │   ├── verify.ts
│   │   ├── storage-state.ts
│   │   └── persistent.ts
│   │
│   ├── locks/
│   │   └── profile-lock.ts
│   │
│   ├── commands/
│   │   ├── init.command.ts
│   │   ├── profile-create.command.ts
│   │   ├── profile-list.command.ts
│   │   ├── profile-login.command.ts
│   │   ├── profile-status.command.ts
│   │   ├── profile-verify.command.ts
│   │   ├── profile-delete.command.ts
│   │   └── run.command.ts
│   │
│   └── utils/
│       ├── atomic-write.ts
│       ├── filesystem.ts
│       └── errors.ts
│
├── examples/
│   └── github-agent.ts
│
├── tests/
│   ├── unit/
│   ├── integration/
│   └── fixtures/
│
└── data/
    ├── profiles/
    ├── locks/
    └── artifacts/
```

`data/` is runtime-only and MUST NOT be tracked by Git.

---

# 8. Bootstrap implementation

## Step 1 — initialize repository

```bash
mkdir browser-vault
cd browser-vault

npm init -y

npm install \
  playwright \
  commander \
  zod \
  proper-lockfile \
  pino

npm install -D \
  typescript \
  tsx \
  vitest \
  @types/node
```

Then generate a lockfile:

```bash
npm install
```

Pin the Playwright version through `package-lock.json`.

The Docker Playwright image MUST use the same Playwright version as the package installed in the project.

Do not intentionally run mismatched client/container Playwright versions.

---

# 9. `package.json`

Implement approximately:

```json
{
  "name": "browser-vault",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "bin": {
    "bv": "./dist/cli.js"
  },
  "scripts": {
    "dev": "tsx src/cli.ts",
    "build": "tsc -p tsconfig.json",
    "start": "node dist/cli.js",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit"
  }
}
```

During development commands can be run as:

```bash
npm run dev -- profile list
```

After build:

```bash
npm link
bv profile list
```

---

# 10. TypeScript configuration

`tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "dist",
    "rootDir": ".",
    "strict": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": true,
    "resolveJsonModule": true
  },
  "include": [
    "src/**/*.ts",
    "examples/**/*.ts",
    "tests/**/*.ts"
  ]
}
```

---

# 11. Vault paths

The vault root is configured by:

```bash
BROWSER_VAULT_HOME
```

Default:

```text
./data
```

Implement:

```ts
export function getVaultHome(): string {
  return process.env.BROWSER_VAULT_HOME ?? "./data";
}
```

Derived paths:

```text
${HOME}/profiles
${HOME}/locks
${HOME}/artifacts
```

Profile state:

```text
${HOME}/profiles/<profile-name>/profile.json
${HOME}/profiles/<profile-name>/storage-state.json
${HOME}/profiles/<profile-name>/user-data/
```

Validate profile names using:

```regex
^[a-z0-9][a-z0-9-_]{0,63}$
```

Examples:

```text
github
gmail-personal
notion-main
reddit-readonly
internal-admin
```

---

# 12. Profile metadata schema

Create `src/profiles/profile.schema.ts`.

Use Zod.

Suggested schema:

```ts
import { z } from "zod";

export const ProfileSchema = z.object({
  version: z.literal(1),

  name: z.string()
    .regex(/^[a-z0-9][a-z0-9-_]{0,63}$/),

  mode: z.enum([
    "storage-state",
    "persistent"
  ]),

  startUrl: z.string().url(),

  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),

  auth: z.object({
    status: z.enum([
      "unknown",
      "valid",
      "expired",
      "error"
    ]),

    lastLoginAt: z.string().datetime().nullable(),
    lastVerifiedAt: z.string().datetime().nullable(),

    verify: z.object({
      url: z.string().url().optional(),
      authenticatedUrlPattern: z.string().optional(),
      authenticatedSelector: z.string().optional(),
      unauthenticatedUrlPattern: z.string().optional()
    }).default({})
  })
});

export type Profile = z.infer<typeof ProfileSchema>;
```

Example `profile.json`:

```json
{
  "version": 1,
  "name": "github",
  "mode": "storage-state",
  "startUrl": "https://github.com/login",
  "createdAt": "2026-08-14T00:00:00.000Z",
  "updatedAt": "2026-08-14T00:00:00.000Z",
  "auth": {
    "status": "unknown",
    "lastLoginAt": null,
    "lastVerifiedAt": null,
    "verify": {
      "url": "https://github.com/settings/profile",
      "unauthenticatedUrlPattern": "/login"
    }
  }
}
```

Do NOT include credentials in this metadata.

---

# 13. Atomic writes

Never overwrite auth state directly.

Unsafe:

```ts
await fs.writeFile(statePath, json);
```

Required algorithm:

```text
storage-state.json.tmp-<uuid>
          │
          ▼
fsync/write complete
          │
          ▼
rename()
          │
          ▼
storage-state.json
```

Implement helper:

```ts
async function atomicWriteJson(
  targetPath: string,
  value: unknown
): Promise<void>
```

Steps:

1. create parent directory;
2. create temporary file in same directory;
3. write JSON;
4. chmod `0600`;
5. rename temporary file over target;
6. best-effort cleanup temp file on error.

Renaming inside the same filesystem provides the desired replacement behavior.

Use the same helper for `profile.json`.

---

# 14. Locking model

Locks are profile-scoped.

```text
data/locks/github.lock
```

## Operations that need an exclusive lock

Require lock:

- login;
- refresh;
- state commit;
- persistent-profile execution;
- profile delete;
- migration.

No lock required:

- read metadata;
- list profiles;
- start read-only `storage-state` context;
- status command.

`verify` SHOULD be read-only and SHOULD NOT write the state snapshot.

It may update profile metadata after verification using a short metadata lock.

Suggested API:

```ts
await withProfileLock(profileName, async () => {
  // exclusive work
});
```

Set a stale timeout so crashed local processes do not permanently block the profile.

Persistent mode MUST hold the lock for the full browser lifetime.

---

# 15. Implement `bv init`

Command:

```bash
bv init
```

Behavior:

1. resolve vault root;
2. create directories;
3. chmod sensitive directories;
4. print location.

Directories:

```text
data/
├── profiles/
├── locks/
└── artifacts/
```

Example output:

```text
Browser Vault initialized
Home: /home/me/browser-vault/data
```

Acceptance criteria:

```bash
bv init
bv init
```

Both calls succeed.

The command must be idempotent.

---

# 16. Implement `bv profile create`

Command:

```bash
bv profile create github \
  --start-url https://github.com/login
```

Optional:

```bash
--mode storage-state
--verify-url https://github.com/settings/profile
--authenticated-selector "[data-login]"
--unauthenticated-url-pattern "/login"
```

Defaults:

```text
mode = storage-state
auth.status = unknown
```

Behavior:

1. validate profile name;
2. reject if profile already exists;
3. create profile directory;
4. write `profile.json`;
5. do not create fake `storage-state.json`.

Output:

```text
Created profile: github
Mode: storage-state
Login required: yes
```

---

# 17. Implement `bv profile list`

Command:

```bash
bv profile list
```

Output:

```text
NAME            MODE             STATUS     LAST VERIFIED
github          storage-state    valid      2026-08-14 09:30
gmail-personal  storage-state    expired    2026-08-10 18:11
legacy-site     persistent       unknown    -
```

Do not inspect or print session secrets.

---

# 18. Implement storage-state login

Core flow:

```text
bv profile login github
        │
        ▼
exclusive profile lock
        │
        ▼
launch clean headed browser
        │
        ▼
open profile.startUrl
        │
        ▼
user logs in manually
        │
        ▼
wait for user confirmation
        │
        ▼
context.storageState()
        │
        ▼
atomic save
        │
        ▼
verify
        │
        ▼
release lock
```

Important: login browser is NOT launched with the previous state by default when the operator explicitly requests a clean login.

Support:

```bash
bv profile login github --reuse-state
```

for refreshing an existing state.

---

# 19. Interactive login implementation

Create:

```ts
async function loginStorageState(
  profile: Profile,
  options: {
    reuseState?: boolean;
    headless?: boolean;
  }
): Promise<void>
```

Pseudo-code:

```ts
const browser = await chromium.launch({
  headless: options.headless ?? false
});

const context = await browser.newContext({
  storageState:
    options.reuseState && exists(statePath)
      ? statePath
      : undefined
});

const page = await context.newPage();

await page.goto(profile.startUrl, {
  waitUntil: "domcontentloaded"
});

console.log(`
Complete login in the browser.

When the account is fully logged in,
return to this terminal and press ENTER.
`);

await waitForEnter();

const state = await context.storageState({
  indexedDB: true
});

await atomicWriteJson(statePath, state);

await context.close();
await browser.close();
```

IndexedDB SHOULD be included because some applications store authentication information there.

Do not save screenshots containing sensitive information automatically during login.

---

# 20. Headless verification

Command:

```bash
bv profile verify github
```

Goal:

Determine if saved authentication still appears valid.

Verification strategy order:

## Strategy A — explicit authenticated selector

Profile config:

```json
{
  "authenticatedSelector": "[data-testid='user-menu']"
}
```

Flow:

```ts
await page.goto(verifyUrl);
await page.locator(selector).waitFor({
  state: "visible",
  timeout: 10_000
});
```

## Strategy B — URL rule

Example:

```text
verifyUrl:
https://github.com/settings/profile

unauthenticatedUrlPattern:
/login
```

If final URL matches login route:

```text
expired
```

Otherwise:

```text
valid
```

## Strategy C — fallback heuristic

If no rule is configured:

1. open `startUrl`;
2. detect whether final URL is obviously a login page;
3. otherwise report `unknown`, not `valid`.

Never claim a session is valid without evidence.

Exit codes:

```text
0 = valid
2 = expired
3 = unknown
4 = execution error
```

This makes it easy for agents/scripts to use.

---

# 21. Storage-state context factory

Create:

```ts
export async function openStorageStateContext(
  profileName: string,
  options?: {
    headless?: boolean;
    trace?: boolean;
  }
)
```

Implementation:

```ts
const profile = await profileRepository.get(profileName);

if (profile.mode !== "storage-state") {
  throw new Error("Profile is not storage-state mode");
}

if (!exists(storageStatePath)) {
  throw new Error(
    `Profile "${profileName}" has no auth state. Run: bv profile login ${profileName}`
  );
}

const browser = await chromium.launch({
  headless: options?.headless ?? true
});

const context = await browser.newContext({
  storageState: storageStatePath
});

return {
  profile,
  browser,
  context,
  close: async () => {
    await context.close();
    await browser.close();
  }
};
```

Default agent contexts are read-only from the Vault perspective.

Closing them MUST NOT overwrite canonical `storage-state.json`.

---

# 22. Public library API

Export from `src/index.ts`:

```ts
export {
  openProfile,
  getProfile,
  listProfiles,
  verifyProfile
} from "./...";
```

Usage:

```ts
import { openProfile } from "browser-vault";

const session = await openProfile("github");

try {
  const page = await session.context.newPage();

  await page.goto("https://github.com/");

  console.log(await page.title());
} finally {
  await session.close();
}
```

This is the primary integration for Node.js agents.

---

# 23. Implement `bv run`

Command:

```bash
bv run github -- node dist/examples/github-agent.js
```

Purpose:

Allow an existing external agent script to discover a profile without needing Browser Vault library calls.

`bv run` sets:

```text
BROWSER_VAULT_PROFILE=github
BROWSER_VAULT_MODE=storage-state
BROWSER_VAULT_STORAGE_STATE=/vault/profiles/github/storage-state.json
```

Then spawns the child command.

Example:

```ts
const context = await browser.newContext({
  storageState:
    process.env.BROWSER_VAULT_STORAGE_STATE
});
```

Rules:

1. path is provided read-only by convention;
2. child process does not receive passwords;
3. child process MUST NOT automatically replace the state file;
4. propagate child exit code;
5. forward SIGINT/SIGTERM.

Example:

```bash
bv run github -- npm run agent:github
```

---

# 24. Docker design

Use the official Playwright image as the browser runtime.

Important requirements:

- pin image Playwright version;
- keep it aligned with npm Playwright version;
- use `init: true`;
- use `ipc: host` for Chromium;
- do not publish any ports in normal headless execution;
- mount Vault data persistently.

Example `compose.yaml`:

```yaml
services:
  browser-vault:
    build:
      context: .
      args:
        PLAYWRIGHT_VERSION: ${PLAYWRIGHT_VERSION}

    init: true
    ipc: host

    environment:
      BROWSER_VAULT_HOME: /vault

    volumes:
      - ./data:/vault

    working_dir: /app

    command:
      - node
      - dist/cli.js
      - profile
      - list
```

Because this is a personal/local project, a bind mount such as:

```text
./data:/vault
```

is useful: auth data is easy to inspect, back up, or remove from the host.

The directory must remain Git-ignored.

---

# 25. Dockerfile

Use a build arg so the project does not silently drift to an arbitrary browser version.

Example:

```dockerfile
ARG PLAYWRIGHT_VERSION

FROM node:22-bookworm AS build

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src

RUN npm run build


ARG PLAYWRIGHT_VERSION
FROM mcr.microsoft.com/playwright:v${PLAYWRIGHT_VERSION}-noble

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=build /app/dist ./dist

ENV NODE_ENV=production
ENV BROWSER_VAULT_HOME=/vault

ENTRYPOINT ["node", "dist/cli.js"]
```

Before build, set:

```bash
PLAYWRIGHT_VERSION=<same-version-as-package>
docker compose build
```

A helper script can later read the installed package version automatically.

---

# 26. `.gitignore`

Required:

```gitignore
node_modules/
dist/
.env

data/**
!data/.gitkeep

playwright-report/
test-results/
*.log
```

Optional:

```gitignore
.auth/
```

Do not commit:

```text
storage-state.json
user-data/
cookies
session dumps
traces from authenticated production sessions
```

unless deliberately sanitized.

---

# 27. `.dockerignore`

Suggested:

```dockerignore
node_modules
dist
data
.git
.gitignore
test-results
playwright-report
*.log
```

Auth state MUST NOT be copied into the Docker image.

It must only enter at runtime via volume mount.

---

# 28. Example agent

Create:

```text
examples/github-agent.ts
```

Implementation:

```ts
import { openProfile } from "../src/index.js";

const session = await openProfile("github");

try {
  const page = await session.context.newPage();

  await page.goto("https://github.com/");

  console.log({
    url: page.url(),
    title: await page.title()
  });
} finally {
  await session.close();
}
```

Acceptance:

```bash
bv profile login github
npm run example:github
```

The page should load as the authenticated user.

---

# 29. Read-only state principle

This is important.

Suppose two agents start from:

```text
storage-state.json @ T0
```

Agent A changes cookies.

Agent B changes cookies differently.

If both automatically save at close:

```text
Agent A ─┐
         ├── writes same canonical file
Agent B ─┘
```

the last close wins.

Therefore:

> Agent contexts never commit state implicitly.

Canonical state changes only through explicit commands:

```bash
bv profile login NAME
bv profile refresh NAME
bv profile commit NAME
```

MVP only needs `login`.

---

# 30. Session expiry handling

Agents should be able to report:

```text
AUTH_EXPIRED
```

Recommended custom error:

```ts
export class AuthExpiredError extends Error {
  constructor(public profileName: string) {
    super(`Authentication expired: ${profileName}`);
  }
}
```

Agent flow:

```text
open profile
   │
   ▼
navigate
   │
   ├── still logged in ── continue
   │
   └── login detected ─── AuthExpiredError
                             │
                             ▼
                 bv profile login <name>
```

Do not automatically enter credentials.

For personal use this manual recovery path is preferable.

---

# 31. Login detection helper

Implement:

```ts
export async function looksLoggedOut(
  page: Page,
  profile: Profile
): Promise<boolean>
```

Rules:

1. configured `unauthenticatedUrlPattern`;
2. configured login selector;
3. common redirect back to profile `startUrl`;
4. otherwise return `false` only if an authenticated selector confirms state;
5. if ambiguous return an explicit unknown result.

Prefer tri-state:

```ts
type AuthCheck =
  | { status: "valid" }
  | { status: "expired"; reason: string }
  | { status: "unknown"; reason: string };
```

Avoid unreliable guesses.

---

# 32. Debug artifacts

On agent failures, support optional:

```bash
BROWSER_VAULT_ARTIFACTS=1
```

Artifacts:

```text
data/artifacts/
└── 2026-08-14T02-40-22Z/
    ├── trace.zip
    ├── failure.png
    └── metadata.json
```

Do not enable authenticated traces by default because they may contain sensitive page content.

Suggested session helper:

```ts
if (traceEnabled) {
  await context.tracing.start({
    screenshots: true,
    snapshots: true
  });
}
```

On close:

```ts
await context.tracing.stop({
  path: tracePath
});
```

---

# 33. Logging

Use structured logs.

Examples:

```json
{
  "level": "info",
  "event": "profile_open",
  "profile": "github",
  "mode": "storage-state"
}
```

Allowed:

- profile name;
- mode;
- timestamps;
- URLs if they do not contain secrets;
- duration;
- status.

Never log:

- cookies;
- Authorization headers;
- localStorage values;
- session tokens;
- request bodies by default;
- passwords;
- TOTP secrets.

---

# 34. Implement persistent mode

Do this only after storage-state MVP works.

Create:

```bash
bv profile create legacy-site \
  --mode persistent \
  --start-url https://example.com/login
```

Directory:

```text
data/profiles/legacy-site/
├── profile.json
└── user-data/
```

Launch:

```ts
const context =
  await chromium.launchPersistentContext(
    userDataDir,
    {
      headless: true
    }
  );
```

Persistent profiles MUST:

1. acquire exclusive profile lock before launch;
2. hold lock until context closes;
3. use a Browser Vault-created directory;
4. never point at the operator's daily Chrome profile.

API:

```ts
const session =
  await openProfile("legacy-site");
```

Internally:

```text
mode storage-state
    -> browser.newContext(storageState)

mode persistent
    -> acquire lock
    -> launchPersistentContext(userDataDir)
```

---

# 35. Persistent login

Command:

```bash
bv profile login legacy-site
```

For persistent mode:

```text
exclusive lock
    │
    ▼
launchPersistentContext(user-data, headless=false)
    │
    ▼
user logs in
    │
    ▼
press ENTER
    │
    ▼
close context
    │
    ▼
release lock
```

There is no separate canonical `storage-state.json` required.

Optionally save a storage-state snapshot for diagnostics, but do not rely on it.

---

# 36. Fully Dockerized interactive login

This is a post-MVP phase.

Headless Docker execution is straightforward.

Interactive login is harder because the operator must see and control the browser.

Implement one of these options:

## Option A — host login helper

Preferred for MVP.

Run the CLI on the host:

```bash
bv profile login github
```

Save the resulting state into:

```text
./data/profiles/github/
```

Docker agents mount the same directory later.

This is the simplest personal workflow.

## Option B — noVNC login container

Later add:

```text
Chromium
   │
 Xvfb
   │
 x11vnc
   │
 noVNC
   │
 browser
```

Expose only localhost:

```text
127.0.0.1:6080
```

Workflow:

```bash
docker compose --profile login up vault-login
```

Then open:

```text
http://127.0.0.1:6080
```

Complete login and stop the login container.

Do not expose noVNC publicly.

---

# 37. Optional remote browser mode

Do NOT implement for MVP.

Possible later architecture:

```text
Agent
  │
  │ WebSocket
  ▼
Playwright Server
  │
  ▼
Chromium in Docker
```

Playwright supports remote browser connections.

This is useful when:

- agents run outside the Docker host;
- browser dependencies should remain centralized;
- browser processes should live in a dedicated container.

However, profile-state ownership must remain explicit.

For `storage-state` profiles, the simplest design remains:

```text
agent requests profile state
       │
       ▼
agent creates isolated BrowserContext
```

Do not add this complexity unless actually needed.

---

# 38. Profile status

Command:

```bash
bv profile status github
```

Output:

```text
Profile: github
Mode: storage-state
State file: present
Auth status: valid
Last login: 2026-08-14 09:12
Last verified: 2026-08-14 09:33
Start URL: https://github.com/login
```

Never print state file contents.

---

# 39. Profile delete

Command:

```bash
bv profile delete github
```

Require explicit confirmation:

```text
Delete profile "github" and all saved authentication data? [y/N]
```

Non-interactive:

```bash
bv profile delete github --yes
```

Process:

1. acquire exclusive lock;
2. recursively delete profile directory;
3. delete stale lock if applicable;
4. leave audit log without secrets.

---

# 40. Profile refresh

Implement after MVP.

Command:

```bash
bv profile refresh github
```

Behavior:

1. acquire exclusive lock;
2. launch context using existing state;
3. open verification URL;
4. let user re-authenticate if needed;
5. explicitly save a fresh storage state;
6. atomically replace canonical state;
7. verify;
8. release lock.

Difference:

```text
login
  -> clean browser by default

refresh
  -> begins from existing state
```

---

# 41. Tests

Use three layers.

## 41.1 Unit tests

Test:

- profile-name validation;
- metadata parsing;
- atomic writes;
- missing state errors;
- lock acquisition;
- lock release;
- profile path traversal prevention.

Examples that MUST fail:

```text
../secret
foo/bar
/github
""
A Profile
```

Examples that MUST pass:

```text
github
github-main
github_2
personal
```

## 41.2 Integration test app

Do not test external websites in the normal test suite.

Create a tiny local fixture HTTP server with:

```text
/login
/dashboard
/logout
```

Login endpoint sets a cookie.

Test:

```text
login
 -> save storageState
 -> close browser
 -> open fresh browser context from state
 -> /dashboard returns authenticated page
```

Then test two contexts concurrently using the same state.

## 41.3 Docker smoke test

Build:

```bash
docker compose build
```

Run:

```bash
docker compose run --rm browser-vault profile list
```

Then run a local non-authenticated page smoke test using Chromium.

---

# 42. Acceptance test for concurrency

This is a required MVP acceptance test.

Create auth state once.

Then:

```ts
const [a, b, c] = await Promise.all([
  openProfile("fixture"),
  openProfile("fixture"),
  openProfile("fixture")
]);
```

Each context visits:

```text
/dashboard
```

Expected:

```text
A authenticated
B authenticated
C authenticated
```

Then close all contexts.

Canonical `storage-state.json` hash MUST remain unchanged.

This proves that normal agent execution is read-only.

---

# 43. Acceptance test for persistent locking

After persistent mode is implemented:

Process A:

```bash
bv run legacy -- node agent-a.js
```

While it is active, Process B:

```bash
bv run legacy -- node agent-b.js
```

Expected behavior:

```text
Profile "legacy" is currently in use.
```

Exit non-zero.

Do not start a second persistent browser.

---

# 44. CLI command matrix

MVP:

```text
bv init

bv profile create <name>
bv profile list
bv profile status <name>
bv profile login <name>
bv profile verify <name>
bv profile delete <name>

bv run <name> -- <command>
```

Post-MVP:

```text
bv profile refresh <name>
bv profile lock-status <name>
bv profile migrate <name>

bv doctor
bv gc
```

---

# 45. `bv doctor`

Post-MVP but useful.

Checks:

```text
✓ Node version
✓ Playwright package
✓ Chromium executable
✓ vault directory writable
✓ profile metadata valid
✓ sensitive files not world-readable
✓ Docker available
✓ Docker Playwright version aligned
```

Example:

```text
Browser Vault doctor

[ok] vault home
[ok] Chromium
[ok] 3 profiles
[warn] github state last verified 12 days ago
[ok] no profile locks
```

---

# 46. Failure behavior

Use predictable errors.

Examples:

## Missing profile

```text
Profile "github2" does not exist.
Create it with:
  bv profile create github2 --start-url <url>
```

## Missing auth state

```text
Profile "github" has not been authenticated.
Run:
  bv profile login github
```

## Expired state

```text
Authentication for "github" appears expired.
Run:
  bv profile refresh github
```

## Locked persistent profile

```text
Profile "legacy" is already in use.
```

## Invalid metadata

```text
Profile metadata is invalid:
data/profiles/github/profile.json
```

Never silently repair auth files.

---

# 47. Environment variables

MVP:

```bash
BROWSER_VAULT_HOME=./data
BROWSER_VAULT_HEADLESS=1
BROWSER_VAULT_LOG_LEVEL=info
BROWSER_VAULT_ARTIFACTS=0
```

Optional:

```bash
BROWSER_VAULT_BROWSER=chromium
```

Do not support arbitrary executable paths in MVP unless required.

---

# 48. Recommended development sequence

Implement in this exact order.

## Milestone 0 — repository

Deliver:

- package.json;
- TypeScript build;
- Vitest;
- CLI executable;
- empty `bv --help`.

Acceptance:

```bash
npm run typecheck
npm run test
npm run build
node dist/cli.js --help
```

---

## Milestone 1 — filesystem vault

Deliver:

- vault paths;
- `bv init`;
- atomic JSON writer;
- permissions;
- `.gitignore`.

Acceptance:

```bash
bv init
tree data
```

Expected:

```text
data
├── artifacts
├── locks
└── profiles
```

---

## Milestone 2 — profile registry

Deliver:

- Zod profile schema;
- repository;
- create;
- list;
- status;
- delete.

Acceptance:

```bash
bv profile create github \
  --start-url https://github.com/login

bv profile list
bv profile status github
```

No browser code required yet.

---

## Milestone 3 — Playwright auth state

Deliver:

- browser launch helper;
- interactive login;
- `storageState({ indexedDB: true })`;
- atomic state persistence.

Acceptance:

```bash
bv profile login fixture
```

State exists after login.

---

## Milestone 4 — agent context API

Deliver:

```ts
openProfile("fixture")
```

Acceptance:

- new context loads state;
- authenticated page works;
- closing context does not mutate canonical state.

This is the first useful Browser Vault release.

Tag:

```text
v0.1.0
```

---

## Milestone 5 — verify + auth expiry

Deliver:

- verification rules;
- `bv profile verify`;
- `AuthExpiredError`;
- exit codes.

Tag:

```text
v0.2.0
```

---

## Milestone 6 — Docker

Deliver:

- Dockerfile;
- compose.yaml;
- bind-mounted `./data`;
- `init: true`;
- `ipc: host`;
- Docker smoke tests.

Acceptance:

```bash
docker compose build

docker compose run --rm browser-vault \
  profile list
```

Then run an example agent in the container.

Tag:

```text
v0.3.0
```

---

## Milestone 7 — `bv run`

Deliver child-process wrapper.

Acceptance:

```bash
bv run github -- node agent.js
```

Agent receives:

```text
BROWSER_VAULT_PROFILE
BROWSER_VAULT_STORAGE_STATE
```

Tag:

```text
v0.4.0
```

---

## Milestone 8 — locking

Deliver:

- profile file lock;
- write-operation locking;
- stale-lock recovery.

Even though read-only state contexts run concurrently, login/refresh/delete need exclusive modification control.

Tag:

```text
v0.5.0
```

---

## Milestone 9 — persistent mode

Deliver:

- `mode=persistent`;
- `user-data/`;
- `launchPersistentContext`;
- full-lifetime exclusive locking.

Only implement when there is a real site that cannot work correctly using storage-state mode.

Tag:

```text
v0.6.0
```

---

## Milestone 10 — fully Dockerized login

Optional.

Deliver:

- Xvfb;
- noVNC;
- localhost-only port;
- login compose profile.

Tag:

```text
v0.7.0
```

---

# 49. Example complete workflow

## Initial setup

```bash
git clone <repo>
cd browser-vault

npm ci
npm run build

bv init
```

## Add GitHub profile

```bash
bv profile create github \
  --start-url https://github.com/login \
  --verify-url https://github.com/settings/profile \
  --unauthenticated-url-pattern "/login"
```

## Authenticate

```bash
bv profile login github
```

Operator manually:

1. enters username;
2. enters password;
3. completes 2FA;
4. confirms successful login;
5. returns to terminal;
6. presses Enter.

Browser Vault saves the resulting state.

## Verify

```bash
bv profile verify github
```

Expected:

```text
github: valid
```

## Agent code

```ts
import { openProfile } from "browser-vault";

const session = await openProfile("github");

try {
  const page = await session.context.newPage();

  await page.goto("https://github.com/issues");

  // agent work...
} finally {
  await session.close();
}
```

## Run in Docker

```bash
docker compose run --rm browser-vault \
  run github -- node dist/examples/github-agent.js
```

---

# 50. Multi-agent example

Given:

```text
github/storage-state.json
```

Run:

```text
Agent researcher
Agent issue-triager
Agent release-checker
```

Each creates its own context:

```text
                     saved auth state
                           │
            ┌──────────────┼──────────────┐
            ▼              ▼              ▼
       Context A       Context B       Context C
            │              │              │
       researcher      triager         checker
```

They share starting authentication but not live browser state.

This is the intended scaling model for personal use.

---

# 51. Why not use one shared Chrome profile?

Avoid:

```text
Chrome user-data/
       ▲
       │
Agent A│Agent B
```

A Chromium user-data directory is not designed for multiple simultaneous browser instances.

The safe rule is:

```text
storage-state mode
    -> parallel contexts allowed

persistent mode
    -> one exclusive owner
```

---

# 52. Why not automatically save agent state?

Because agent actions can mutate cookies and storage.

If every agent commits state:

```text
Agent 1 closes at 12:00:01
Agent 2 closes at 12:00:02
```

Agent 2 unintentionally overwrites Agent 1.

Canonical auth must therefore be explicit.

Recommended commands:

```text
login
refresh
```

Normal agent execution is ephemeral.

---

# 53. Future Browser Broker API

Only implement if agents stop running on the same machine/filesystem.

Possible API:

```text
POST /v1/profiles/:name/leases
DELETE /v1/leases/:id
GET /v1/profiles
GET /v1/profiles/:name/status
POST /v1/profiles/:name/verify
```

Do NOT return raw auth state over a network unless the transport and access model are intentionally secured.

A better future design may run browser operations inside the broker and provide a restricted automation protocol.

Not MVP.

---

# 54. Backup policy

Because this is personal infrastructure, backups are optional.

Never commit auth state to Git.

If backups are needed:

```text
data/profiles/
       │
       ▼
encrypted archive
       │
       ▼
private backup
```

Example design later:

```bash
bv backup --encrypt
bv restore <archive>
```

Do not implement plaintext cloud backup.

---

# 55. Logout / revocation

Deleting local state does not necessarily revoke server-side sessions.

Provide:

```bash
bv profile delete github
```

but document that users should also revoke active sessions from the website when needed.

For suspected state leakage:

1. revoke website sessions;
2. delete Browser Vault profile;
3. create a new profile;
4. authenticate again.

---

# 56. Definition of Done — MVP

MVP is considered complete only when all are true:

- [ ] `npm run typecheck` passes
- [ ] `npm test` passes
- [ ] `npm run build` passes
- [ ] `bv init` is idempotent
- [ ] profile names are validated
- [ ] path traversal is rejected
- [ ] profile create/list/status/delete works
- [ ] interactive login saves storage state
- [ ] IndexedDB capture is enabled
- [ ] state file is Git-ignored
- [ ] auth secrets are not logged
- [ ] `openProfile()` starts authenticated context
- [ ] two or more contexts can reuse the same state concurrently
- [ ] normal agent context does not modify canonical state
- [ ] verification reports valid/expired/unknown
- [ ] Docker image builds
- [ ] Chromium launches successfully in Docker
- [ ] Docker mounts Vault data persistently
- [ ] Docker execution uses init handling
- [ ] Chromium Docker runtime uses host IPC
- [ ] example agent works
- [ ] README contains setup and security warnings

---

# 57. Recommended README quick start

The eventual `README.md` should lead with:

```bash
npm ci
npm run build

bv init

bv profile create github \
  --start-url https://github.com/login

bv profile login github

bv profile verify github

bv run github -- node my-agent.js
```

Then explain:

> Browser Vault stores authenticated browser state locally. Treat the `data/` directory like a credential store and never commit it to Git.

---

# 58. Implementation principles

Keep these rules stable as the project grows.

### Rule 1

`storageState` is the default abstraction for a profile.

### Rule 2

Normal agent sessions are read-only snapshots.

### Rule 3

Canonical auth updates are explicit.

### Rule 4

Persistent profiles are exclusive resources.

### Rule 5

Auth data never enters the Docker image.

### Rule 6

No passwords are required by Browser Vault.

### Rule 7

Authentication ambiguity should return `unknown`, never a fake success.

### Rule 8

Prefer filesystem + CLI until a real need for a service/database appears.

### Rule 9

Keep Docker runtime and Playwright package versions aligned.

### Rule 10

Optimize for a single trusted operator, not multi-tenant infrastructure.

---

# 59. Suggested first coding session

Implement only these files first:

```text
src/
├── cli.ts
├── config/
│   └── paths.ts
├── profiles/
│   ├── profile.schema.ts
│   └── profile.repository.ts
├── commands/
│   ├── init.command.ts
│   ├── profile-create.command.ts
│   └── profile-list.command.ts
└── utils/
    └── atomic-write.ts
```

Target:

```bash
bv init

bv profile create github \
  --start-url https://github.com/login

bv profile list
```

Do not touch persistent Chromium profiles, Docker login UI, remote browser servers, or APIs until this base is stable.

---

# 60. Suggested second coding session

Implement:

```text
src/browser/
├── launch.ts
├── login.ts
└── storage-state.ts
```

Target:

```bash
bv profile login github
```

Then:

```ts
const session = await openProfile("github");
```

This gives the project its core value.

---

# 61. Suggested third coding session

Implement:

```text
verify.ts
AuthExpiredError
Dockerfile
compose.yaml
examples/
```

Target full flow:

```text
create
  ↓
login
  ↓
verify
  ↓
agent
  ↓
Docker agent
```

At that point `browser-vault` is useful enough for daily personal agent work.

---

# 62. Reference behavior from upstream tools

The architecture above intentionally follows these upstream capabilities:

- Playwright supports persisting authenticated state and reusing it in new contexts.
- Playwright storage-state snapshots can include IndexedDB where required.
- BrowserContexts provide isolated browser state.
- Playwright supports persistent contexts backed by a `userDataDir`.
- Browsers do not permit multiple simultaneous instances using the same user-data directory.
- Playwright's Docker guidance recommends init handling and host IPC for Chromium.
- Docker volumes/bind mounts provide persistence outside a container lifecycle.

Official references:

- Playwright Authentication: https://playwright.dev/docs/auth
- Playwright BrowserContext API: https://playwright.dev/docs/api/class-browsercontext
- Playwright BrowserType API: https://playwright.dev/docs/api/class-browsertype
- Playwright Browser Contexts / Isolation: https://playwright.dev/docs/browser-contexts
- Playwright Docker: https://playwright.dev/docs/docker
- Playwright Codegen / save-storage: https://playwright.dev/docs/codegen
- Docker Volumes: https://docs.docker.com/engine/storage/volumes/
- Docker Bind Mounts: https://docs.docker.com/engine/storage/bind-mounts/
- Docker Compose Volumes: https://docs.docker.com/reference/compose-file/volumes/

---

# 63. Final architecture

MVP:

```text
                      ┌────────────────────┐
                      │    browser-vault   │
                      │                    │
                      │ profiles metadata  │
                      │ auth state files   │
                      │ locks              │
                      └─────────┬──────────┘
                                │
                         storageState
                                │
             ┌──────────────────┼──────────────────┐
             │                  │                  │
             ▼                  ▼                  ▼
      Playwright Context  Playwright Context  Playwright Context
             │                  │                  │
             ▼                  ▼                  ▼
          Agent A            Agent B            Agent C
```

Fallback persistent mode:

```text
Agent
  │
  ▼
exclusive profile lock
  │
  ▼
launchPersistentContext
  │
  ▼
dedicated user-data directory
```

Docker boundary:

```text
Host
│
├── browser-vault/data/      ← persistent secret data
│
└── Docker
     │
     ├── Browser Vault CLI
     └── Playwright Chromium
```

This is intentionally small enough for personal use while leaving a clean path toward a browser broker if the agent infrastructure grows later.
