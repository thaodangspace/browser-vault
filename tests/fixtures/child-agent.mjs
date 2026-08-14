import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";

const statePath = process.env.BROWSER_VAULT_STORAGE_STATE;
const overwriteState = process.argv[2] === "overwrite";
let stateWasOverwritten = false;
if (overwriteState && statePath) {
  await writeFile(statePath, JSON.stringify({ corrupted: true }));
  stateWasOverwritten = (await readFile(statePath, "utf8")) === JSON.stringify({ corrupted: true });
}

console.log(JSON.stringify({
  profile: process.env.BROWSER_VAULT_PROFILE,
  mode: process.env.BROWSER_VAULT_MODE,
  statePath,
  stateExists: Boolean(statePath && existsSync(statePath)),
  ...(overwriteState ? { stateWasOverwritten } : {}),
}));

if (process.argv[2] === "wait") {
  await new Promise(() => undefined);
}

process.exit(Number(overwriteState ? 0 : process.argv[2] ?? 0));
