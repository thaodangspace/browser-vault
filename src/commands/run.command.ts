import { constants } from "node:os";
import { spawn } from "node:child_process";
import { profileRepository } from "../profiles/profile.repository.js";
import { createRuntimeStateSnapshot } from "../profiles/runtime-state-snapshot.js";
import { VaultError } from "../utils/errors.js";

function signalExitCode(signal: NodeJS.Signals): number {
  return 128 + (constants.signals[signal] ?? 1);
}

export async function runProfileCommand(name: string, childArguments: string[]): Promise<void> {
  const normalizedChildArguments = childArguments[0] === "--" ? childArguments.slice(1) : childArguments;
  const profile = await profileRepository.get(name);
  if (profile.mode !== "storage-state") {
    throw new VaultError(`Profile mode "${profile.mode}" is not implemented.`);
  }

  if (normalizedChildArguments.length === 0) {
    throw new VaultError("A child command is required. Usage: bv run <name> -- <command...>");
  }

  const snapshot = await createRuntimeStateSnapshot(name);
  try {
    const [command, ...arguments_] = normalizedChildArguments;
    const child = spawn(command, arguments_, {
      stdio: "inherit",
      env: {
        ...process.env,
        BROWSER_VAULT_PROFILE: profile.name,
        BROWSER_VAULT_MODE: profile.mode,
        BROWSER_VAULT_STORAGE_STATE: snapshot.path,
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

      const removeSignalHandlers = () => {
        process.off("SIGINT", onSigint);
        process.off("SIGTERM", onSigterm);
      };
      child.once("error", (error) => {
        removeSignalHandlers();
        reject(error);
      });
      child.once("close", (code, signal) => {
        removeSignalHandlers();
        if (signal) process.exitCode = signalExitCode(signal);
        else process.exitCode = code ?? 1;
        resolve();
      });
    });
  } finally {
    await snapshot.cleanup();
  }
}
