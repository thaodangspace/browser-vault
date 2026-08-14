import { withProfileLock } from "../../src/locks/profile-lock.js";

const [name, holdMsArgument, crashAfterMsArgument] = process.argv.slice(2);
if (!name || !holdMsArgument) {
  throw new Error("Usage: lock-holder.ts <profile-name> <hold-ms> [crash-after-ms]");
}

await withProfileLock(
  name,
  async () => {
    process.stdout.write("locked\n");
    if (crashAfterMsArgument) {
      setTimeout(() => process.kill(process.pid, "SIGKILL"), Number(crashAfterMsArgument));
    }
    await new Promise((resolve) => setTimeout(resolve, Number(holdMsArgument)));
  },
  { stale: 2_000, retries: 0 },
);
