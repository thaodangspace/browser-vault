import { createServer } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { findAvailableLocalPort } from "../../src/utils/local-port.js";

const servers: ReturnType<typeof createServer>[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  })));
});

describe("findAvailableLocalPort", () => {
  it("skips a port already bound on loopback", async () => {
    const server = createServer();
    servers.push(server);
    await new Promise<void>((resolve) => server.listen({ host: "127.0.0.1", port: 0 }, resolve));
    const occupiedPort = (server.address() as { port: number }).port;

    expect(await findAvailableLocalPort(occupiedPort)).toBeGreaterThan(occupiedPort);
  });
});
