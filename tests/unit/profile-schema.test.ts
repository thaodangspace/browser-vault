import { describe, expect, it } from "vitest";
import { ProfileNameSchema, ProfileSchema } from "../../src/profiles/profile.schema.js";

const names = ["github", "github-main", "github_2", "personal"];
const rejectedNames = ["../secret", "foo/bar", "/github", "", "A Profile"];

const profile = {
  version: 1,
  name: "github",
  mode: "storage-state",
  startUrl: "https://github.com/login",
  createdAt: "2026-08-14T00:00:00.000Z",
  updatedAt: "2026-08-14T00:00:00.000Z",
  auth: {
    status: "unknown",
    lastLoginAt: null,
    lastVerifiedAt: null,
    verify: {},
  },
} as const;

describe("profile schema", () => {
  it.each(names)("accepts valid profile name %s", (name) => {
    expect(ProfileNameSchema.safeParse(name).success).toBe(true);
  });

  it.each(rejectedNames)("rejects unsafe profile name %s", (name) => {
    expect(ProfileNameSchema.safeParse(name).success).toBe(false);
  });

  it("validates profile metadata", () => {
    expect(ProfileSchema.parse(profile)).toEqual(profile);
  });
});
