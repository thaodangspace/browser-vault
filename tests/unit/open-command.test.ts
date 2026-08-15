import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getProfile: vi.fn(),
  runDockerCompose: vi.fn(),
  findDockerContainers: vi.fn(),
  removeDockerContainers: vi.fn(),
  findAvailableLocalPort: vi.fn(),
}));

vi.mock("../../src/profiles/profile.repository.js", () => ({
  profileRepository: { get: mocks.getProfile },
}));
vi.mock("../../src/utils/docker-compose.js", () => ({
  runDockerCompose: mocks.runDockerCompose,
  findDockerContainers: mocks.findDockerContainers,
  removeDockerContainers: mocks.removeDockerContainers,
}));
vi.mock("../../src/utils/local-port.js", () => ({
  findAvailableLocalPort: mocks.findAvailableLocalPort,
}));

import { closeDockerBrowserCommand, openProfileInDockerCommand } from "../../src/commands/open.command.js";

const profile = {
  version: 1 as const,
  name: "personal",
  mode: "storage-state" as const,
  startUrl: "https://example.com/login",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  auth: { status: "valid" as const, lastLoginAt: null, lastVerifiedAt: null, verify: {} },
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getProfile.mockResolvedValue(profile);
  mocks.runDockerCompose.mockResolvedValue(undefined);
  mocks.findDockerContainers.mockResolvedValue([]);
  mocks.removeDockerContainers.mockResolvedValue(undefined);
  mocks.findAvailableLocalPort.mockResolvedValue(6080);
  vi.spyOn(console, "log").mockImplementation(() => undefined);
});

afterEach(() => vi.restoreAllMocks());

describe("bv open Docker command", () => {
  it("runs an isolated read-only noVNC container on the requested port without requiring saved authentication", async () => {
    mocks.findAvailableLocalPort.mockResolvedValue(6081);
    await openProfileInDockerCommand("personal", "https://example.com/dashboard", { port: "6081" });

    expect(mocks.findAvailableLocalPort).toHaveBeenCalledWith(6081);
    expect(mocks.runDockerCompose).toHaveBeenCalledOnce();
    const [arguments_, options] = mocks.runDockerCompose.mock.calls[0] as [string[], { environment: Record<string, string> }];
    expect(arguments_).toEqual(expect.arrayContaining([
      "--profile",
      "vnc",
      "run",
      "--rm",
      "--service-ports",
      "--label",
      "browser-vault.open=true",
      "--volume",
      expect.stringMatching(/\/profiles\/personal:\/vault\/profiles\/personal:ro$/),
      "browser-vault-vnc",
      "browse",
      "personal",
      "https://example.com/dashboard",
    ]));
    expect(arguments_).toContainEqual(expect.stringMatching(/^browser-vault\.session=bv-open-[0-9a-f-]+$/));
    expect(options).toEqual({ environment: { BROWSER_VAULT_VNC_PORT: "6081" } });
  });

  it("uses the profile start URL and the next available port when no URL is supplied", async () => {
    mocks.findAvailableLocalPort.mockResolvedValue(6081);

    await openProfileInDockerCommand("personal", undefined);

    expect(mocks.findAvailableLocalPort).toHaveBeenCalledWith(6080);
    const [arguments_] = mocks.runDockerCompose.mock.calls[0] as [string[]];
    expect(arguments_).toContain("https://example.com/login");
    const [, options] = mocks.runDockerCompose.mock.calls[0] as [string[], { environment: Record<string, string> }];
    expect(options.environment.BROWSER_VAULT_VNC_PORT).toBe("6081");
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining("127.0.0.1:6081"));
  });

  it.each(["0", "65536", "nope", "1.5"])('rejects invalid port "%s" before invoking Docker', async (port) => {
    await expect(openProfileInDockerCommand("personal", "https://example.com", { port })).rejects.toThrow("--port must be an integer");
    expect(mocks.runDockerCompose).not.toHaveBeenCalled();
  });

  it("rejects invalid names and URLs before invoking Docker", async () => {
    await expect(openProfileInDockerCommand("../personal", "https://example.com")).rejects.toThrow("Invalid profile name");
    await expect(openProfileInDockerCommand("personal", "file:///vault/state")).rejects.toThrow("http:// or https://");
    expect(mocks.runDockerCompose).not.toHaveBeenCalled();
  });

  it("refuses persistent profiles", async () => {
    mocks.getProfile.mockResolvedValue({ ...profile, mode: "persistent" });
    await expect(openProfileInDockerCommand("personal", "https://example.com")).rejects.toThrow("not implemented");
    expect(mocks.runDockerCompose).not.toHaveBeenCalled();
  });
});

describe("bv close Docker command", () => {
  it("removes only containers labelled with the selected session", async () => {
    mocks.findDockerContainers.mockResolvedValue(["container-id"]);

    await closeDockerBrowserCommand("bv-open-123");

    expect(mocks.findDockerContainers).toHaveBeenCalledWith("bv-open-123");
    expect(mocks.removeDockerContainers).toHaveBeenCalledWith(["container-id"]);
  });

  it("does not remove containers when no matching session is active", async () => {
    await closeDockerBrowserCommand("bv-open-missing");

    expect(mocks.removeDockerContainers).not.toHaveBeenCalled();
  });
});
