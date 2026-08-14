import { existsSync } from "node:fs";

const statePath = process.env.BROWSER_VAULT_STORAGE_STATE;
console.log(JSON.stringify({
  profile: process.env.BROWSER_VAULT_PROFILE,
  mode: process.env.BROWSER_VAULT_MODE,
  statePath,
  stateExists: Boolean(statePath && existsSync(statePath)),
}));
process.exit(Number(process.argv[2] ?? 0));
