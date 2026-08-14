import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { VaultError } from "./errors.js";

const projectRoot = fileURLToPath(new URL("../../", import.meta.url));

/** Run Docker Compose against this checkout rather than the caller's directory. */
export async function runDockerCompose(arguments_: string[]): Promise<void> {
  if (!existsSync(`${projectRoot}/compose.yaml`)) {
    throw new VaultError("Docker mode requires compose.yaml beside the bv installation.");
  }

  const child = spawn("docker", ["compose", ...arguments_], {
    cwd: projectRoot,
    stdio: "inherit",
  });

  await new Promise<void>((resolve, reject) => {
    child.once("error", (error) => {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        reject(new VaultError("Docker is required for this command. Install and start Docker Desktop, then try again."));
        return;
      }
      reject(error);
    });
    child.once("close", (code, signal) => {
      if (signal) {
        reject(new VaultError(`docker compose was terminated by ${signal}.`));
      } else if (code !== 0) {
        reject(new VaultError(`docker compose exited with status ${code ?? 1}. Run npm run docker:build, then try again.`));
      } else {
        resolve();
      }
    });
  });
}
