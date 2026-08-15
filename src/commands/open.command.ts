import { randomUUID } from "node:crypto";
import { profileDir } from "../config/paths.js";
import { ProfileNameSchema } from "../profiles/profile.schema.js";
import { profileRepository } from "../profiles/profile.repository.js";
import { findDockerContainers, removeDockerContainers, runDockerCompose } from "../utils/docker-compose.js";
import { InvalidProfileNameError, VaultError } from "../utils/errors.js";
import { validateHttpUrl } from "../utils/http-url.js";
import { findAvailableLocalPort } from "../utils/local-port.js";

const DEFAULT_VNC_PORT = 6080;

export interface OpenProfileInDockerOptions {
  port?: string;
}

function parseVncPort(rawPort: string | undefined): number {
  if (rawPort === undefined) return DEFAULT_VNC_PORT;
  if (!/^\d+$/.test(rawPort)) {
    throw new VaultError("--port must be an integer between 1 and 65535.");
  }

  const port = Number(rawPort);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
    throw new VaultError("--port must be an integer between 1 and 65535.");
  }
  return port;
}

/**
 * Run an isolated, read-only headed profile session in a temporary noVNC
 * container. Each invocation owns its own X display and localhost port.
 */
export async function openProfileInDockerCommand(
  name: string,
  rawUrl: string | undefined,
  options: OpenProfileInDockerOptions = {},
): Promise<void> {
  if (!ProfileNameSchema.safeParse(name).success) throw new InvalidProfileNameError(name);
  const requestedPort = parseVncPort(options.port);

  const profile = await profileRepository.get(name);
  const url = validateHttpUrl(rawUrl ?? profile.startUrl);
  if (profile.mode !== "storage-state") {
    throw new VaultError(`Profile mode "${profile.mode}" is not implemented.`);
  }
  const port = await findAvailableLocalPort(requestedPort);
  const sessionId = `bv-open-${randomUUID()}`;
  const profileMount = `${profileDir(name)}:/vault/profiles/${name}:ro`;
  console.log(`Session: ${sessionId}`);
  console.log(`Open noVNC at http://127.0.0.1:${port}/vnc.html?autoconnect=true&resize=scale`);

  await runDockerCompose(
    [
      "--profile",
      "vnc",
      "run",
      "--rm",
      "--service-ports",
      "--name",
      sessionId,
      "--label",
      "browser-vault.open=true",
      "--label",
      `browser-vault.session=${sessionId}`,
      "--volume",
      profileMount,
      "browser-vault-vnc",
      "browse",
      name,
      url,
    ],
    { environment: { BROWSER_VAULT_VNC_PORT: String(port) } },
  );
}

/** Stop one named noVNC session, or every active Browser Vault noVNC session. */
export async function closeDockerBrowserCommand(sessionId?: string): Promise<void> {
  const containers = await findDockerContainers(sessionId);
  if (containers.length === 0) {
    console.log(sessionId ? `No active Browser Vault session named ${sessionId}.` : "No active Browser Vault noVNC sessions.");
    return;
  }

  await removeDockerContainers(containers);
  console.log(sessionId ? `Closed Browser Vault session: ${sessionId}` : `Closed ${containers.length} Browser Vault noVNC session(s).`);
}
