import { z } from "zod";

const booleanEnvironmentValue = z.preprocess((value) => {
  if (value === undefined) return undefined;
  if (value === "1" || value === "true") return true;
  if (value === "0" || value === "false") return false;
  return value;
}, z.boolean());

const EnvironmentSchema = z.object({
  BROWSER_VAULT_HEADLESS: booleanEnvironmentValue.default(false),
  BROWSER_VAULT_LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  BROWSER_VAULT_ARTIFACTS: booleanEnvironmentValue.default(false),
});

export type VaultEnvironment = z.infer<typeof EnvironmentSchema>;

export function getEnvironment(environment: NodeJS.ProcessEnv = process.env): VaultEnvironment {
  return EnvironmentSchema.parse(environment);
}
