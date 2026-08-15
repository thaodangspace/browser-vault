import { createServer } from "node:net";
import { VaultError } from "./errors.js";

async function isAvailable(port: number): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", (error) => {
      if (["EADDRINUSE", "EACCES"].includes((error as NodeJS.ErrnoException).code ?? "")) {
        resolve(false);
        return;
      }
      reject(error);
    });
    server.once("listening", () => {
      server.close((error) => {
        if (error) reject(error);
        else resolve(true);
      });
    });
    server.listen({ host: "127.0.0.1", port, exclusive: true });
  });
}

/** Return the first free loopback TCP port at or above the requested port. */
export async function findAvailableLocalPort(startPort: number): Promise<number> {
  for (let port = startPort; port <= 65_535; port += 1) {
    if (await isAvailable(port)) return port;
  }
  throw new VaultError(`No available local noVNC port exists from ${startPort} through 65535.`);
}
