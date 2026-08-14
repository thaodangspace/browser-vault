import { constants } from "node:os";
import { spawn } from "node:child_process";
import { profileRepository } from "../profiles/profile.repository.js";
import { storageStatePath } from "../config/paths.js";
import { NoAuthStateError, VaultError } from "../utils/errors.js";
import { pathExists } from "../utils/filesystem.js";

function signalExitCode(signal: NodeJS.Signals): number {
  return 128 + (constants.signals[signal] ?? 1);
}

export async function runProfileCommand(name: string, childArguments: string[]): Promise<void> {
  const normalizedChildArguments = childArguments[0] === "--" ? childArguments.slice(1) : childArguments;
  const profile = await profileRepository.get(name);
  if (profile.mode !== "storage-state") {
    throw new VaultError(`Profile mode "${profile.mode}" is not implemented.`);
  }

  const statePath = storageStatePath(name);
  if (!(await pathExists(statePath))) {
    throw new NoAuthStateError(name);
  }
  if (normalizedChildArguments.length === 0) {
    throw new VaultError("A child command is required. Usage: bv run <name> -- <command...>");
  }

  const [command, ...arguments_] = normalizedChildArguments;
  const child = spawn(command, arguments_, {
    stdio: "inherit",
    env: {
      ...process.env,
      BROWSER_VAULT_PROFILE: profile.name,
      BROWSER_VAULT_MODE: profile.mode,
      BROWSER_VAULT_STORAGE_STATE: statePath,
    },
  });

  await new Promise<void>((resolve, reject) => {
    const forwardSignal = (signal: NodeJS.Signals) => {
      if (!child.killed) child.kill(signal);
    };
    const onSigint = () => forwardSignal("SIGINT");
    const onSigterm = () => forwardSignal("SIGTERM");
    process.once("SIGINT", onSigint);
    process.once("SIGTERM", onSigterm);

    const cleanup = () => {
      process.off("SIGINT", onSigint);
      process.off("SIGTERM", onSigterm);
    };
    child.once("error", (error) => {
      cleanup();
      reject(error);
    });
    child.once("close", (code, signal) => {
      cleanup();
      if (signal) process.exitCode = signalExitCode(signal);
      else process.exitCode = code ?? 1;
      resolve();
    });
  });
}
