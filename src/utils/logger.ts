import pino, { type DestinationStream, type Logger } from "pino";

const sensitiveKeys = ["cookies", "localStorage", "origins", "token", "authorization", "password", "value"];
const redactPaths = sensitiveKeys.flatMap((key) => [key, `*.${key}`, `*.*.${key}`, `*.*.*.${key}`]);

export function createLogger(destination?: DestinationStream): Logger {
  return pino(
    {
      level: process.env.BROWSER_VAULT_LOG_LEVEL ?? "info",
      redact: {
        paths: redactPaths,
        censor: "[Redacted]",
      },
    },
    destination,
  );
}

export const logger = createLogger();
