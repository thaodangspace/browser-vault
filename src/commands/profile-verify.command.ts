import { verifyProfile } from "../browser/verify.js";

const exitCodes = { valid: 0, expired: 2, unknown: 3 } as const;

export async function profileVerifyCommand(name: string): Promise<void> {
  const result = await verifyProfile(name);
  console.log(`${name}: ${result.status}`);
  process.exitCode = exitCodes[result.status];
}
