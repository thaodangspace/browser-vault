import { createServer, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

const sessionCookie = "fixture_session=fixture-session-token";
const cookieAttributes = "Path=/; HttpOnly; SameSite=Lax";

function sendHtml(response: ServerResponse, html: string, statusCode = 200, headers: Record<string, string> = {}): void {
  response.writeHead(statusCode, { "content-type": "text/html; charset=utf-8", ...headers });
  response.end(html);
}

function hasValidSession(cookieHeader: string | undefined): boolean {
  return cookieHeader?.split(";").some((value) => value.trim() === sessionCookie) ?? false;
}

const loginPage = `<!doctype html>
<html><body>
  <h1>Fixture login</h1>
  <form method="post" action="/login">
    <label>Username <input name="username" autocomplete="username"></label>
    <label>Password <input name="password" type="password" autocomplete="current-password"></label>
    <button type="submit">Sign in</button>
  </form>
</body></html>`;

const dashboardPage = `<!doctype html>
<html><body>
  <h1>Authenticated fixture dashboard</h1>
  <div data-testid="user-menu">Fixture User</div>
  <script>
    localStorage.setItem("fixture-local-storage", "fixture-local-value");
    const request = indexedDB.open("fixture-auth-db", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("state");
    request.onsuccess = () => {
      const transaction = request.result.transaction("state", "readwrite");
      transaction.objectStore("state").put("fixture-indexeddb-value", "login");
    };
  </script>
</body></html>`;

export interface FixtureServer {
  url: string;
  close(): Promise<void>;
}

export async function startFixtureServer(): Promise<FixtureServer> {
  const server: Server = createServer((request, response) => {
    const requestUrl = new URL(request.url ?? "/", "http://fixture.local");

    if (request.method === "GET" && requestUrl.pathname === "/login") {
      sendHtml(response, loginPage);
      return;
    }

    if (request.method === "POST" && requestUrl.pathname === "/login") {
      response.writeHead(302, {
        location: "/dashboard",
        "set-cookie": `${sessionCookie}; ${cookieAttributes}`,
      });
      response.end();
      return;
    }

    if (request.method === "GET" && requestUrl.pathname === "/dashboard") {
      if (!hasValidSession(request.headers.cookie)) {
        response.writeHead(302, { location: "/login" });
        response.end();
        return;
      }
      sendHtml(response, dashboardPage);
      return;
    }

    if (request.method === "GET" && requestUrl.pathname === "/logout") {
      response.writeHead(302, {
        location: "/login",
        "set-cookie": `fixture_session=; ${cookieAttributes}; Max-Age=0`,
      });
      response.end();
      return;
    }

    sendHtml(response, "Not found", 404);
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });

  const address = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve()))),
  };
}
