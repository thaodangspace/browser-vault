import { InvalidProfileNameError } from "../utils/errors.js";
import { validateHttpUrl } from "../utils/http-url.js";
import { ProfileNameSchema } from "../profiles/profile.schema.js";
import { runDockerCompose } from "../utils/docker-compose.js";

/**
 * Start the local-only Docker/noVNC service, then open a URL using a read-only
 * profile session inside it. The service intentionally remains running after
 * the browser command ends so its noVNC display is reusable.
 */
export async function openProfileInDockerCommand(name: string, rawUrl: string): Promise<void> {
  if (!ProfileNameSchema.safeParse(name).success) throw new InvalidProfileNameError(name);
  const url = validateHttpUrl(rawUrl);

  await runDockerCompose(["--profile", "vnc", "up", "-d", "browser-vault-vnc"]);
  console.log("Open noVNC at http://localhost:6080/vnc.html?autoconnect=true&resize=scale");
  await runDockerCompose([
    "--profile",
    "vnc",
    "exec",
    "-e",
    "DISPLAY=:99",
    "browser-vault-vnc",
    "node",
    "/app/dist/cli.js",
    "browse",
    name,
    url,
  ]);
}

/** Stop the shared Docker/noVNC service and any headed browser sessions in it. */
export async function closeDockerBrowserCommand(): Promise<void> {
  await runDockerCompose(["--profile", "vnc", "stop", "browser-vault-vnc"]);
}

