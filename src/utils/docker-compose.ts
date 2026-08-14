import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { VaultError } from "./errors.js";

const projectRoot = fileURLToPath(new URL("../../", import.meta.url));

export interface DockerComposeOptions {
  environment?: NodeJS.ProcessEnv;
}

function dockerUnavailableError(): VaultError {
  return new VaultError("Docker is required for this command. Install and start Docker Desktop, then try again.");
}

/** Run Docker Compose against this checkout rather than the caller's directory. */
export async function runDockerCompose(arguments_: string[], options: DockerComposeOptions = {}): Promise<void> {
  if (!existsSync(`${projectRoot}/compose.yaml`)) {
    throw new VaultError("Docker mode requires compose.yaml beside the bv installation.");
  }

  const child = spawn("docker", ["compose", ...arguments_], {
    cwd: projectRoot,
    env: { ...process.env, ...options.environment },
    stdio: "inherit",
  });

  await new Promise<void>((resolve, reject) => {
    child.once("error", (error) => {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        reject(dockerUnavailableError());
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

/** Return IDs for active ephemeral Browser Vault noVNC containers. */
export async function findDockerContainers(sessionId?: string): Promise<string[]> {
  const arguments_ = ["container", "ls", "--quiet", "--filter", "label=browser-vault.open=true"];
  if (sessionId) arguments_.push("--filter", `label=browser-vault.session=${sessionId}`);

  const child = spawn("docker", arguments_, { stdio: ["ignore", "pipe", "inherit"] });
  let output = "";
  child.stdout.on("data", (chunk: Buffer) => {
    output += chunk.toString();
  });

  await new Promise<void>((resolve, reject) => {
    child.once("error", (error) => {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        reject(dockerUnavailableError());
        return;
      }
      reject(error);
    });
    child.once("close", (code, signal) => {
      if (signal) {
        reject(new VaultError(`docker container ls was terminated by ${signal}.`));
      } else if (code !== 0) {
        reject(new VaultError(`docker container ls exited with status ${code ?? 1}.`));
      } else {
        resolve();
      }
    });
  });

  return output.split("\n").map((id) => id.trim()).filter(Boolean);
}

/** Force-remove containers previously identified by findDockerContainers. */
export async function removeDockerContainers(containerIds: string[]): Promise<void> {
  if (containerIds.length === 0) return;
  const child = spawn("docker", ["container", "rm", "--force", ...containerIds], { stdio: "inherit" });

  await new Promise<void>((resolve, reject) => {
    child.once("error", (error) => {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        reject(dockerUnavailableError());
        return;
      }
      reject(error);
    });
    child.once("close", (code, signal) => {
      if (signal) {
        reject(new VaultError(`docker container rm was terminated by ${signal}.`));
      } else if (code !== 0) {
        reject(new VaultError(`docker container rm exited with status ${code ?? 1}.`));
      } else {
        resolve();
      }
    });
  });
}
