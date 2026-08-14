import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startFixtureServer, type FixtureServer } from "../fixtures/auth-server.js";

let fixture: FixtureServer;
let cookie: string;

beforeAll(async () => {
  fixture = await startFixtureServer();
});

afterAll(async () => {
  await fixture.close();
});

describe("local fixture auth server", () => {
  it("redirects unauthenticated dashboard requests to login", async () => {
    const response = await fetch(`${fixture.url}/dashboard`, { redirect: "manual" });

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/login");
  });

  it("creates a session cookie and serves authenticated dashboard content", async () => {
    const login = await fetch(`${fixture.url}/login`, { method: "POST", redirect: "manual" });
    cookie = login.headers.get("set-cookie")?.split(";")[0] ?? "";

    expect(login.status).toBe(302);
    expect(cookie).toContain("fixture_session=fixture-session-token");

    const dashboard = await fetch(`${fixture.url}/dashboard`, { headers: { cookie } });
    const html = await dashboard.text();
    expect(dashboard.status).toBe(200);
    expect(html).toContain("Authenticated fixture dashboard");
    expect(html).toContain('data-testid="user-menu"');
  });

  it("clears the session cookie on logout", async () => {
    const response = await fetch(`${fixture.url}/logout`, { headers: { cookie }, redirect: "manual" });

    expect(response.status).toBe(302);
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
  });
});
