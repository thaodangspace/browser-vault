// Concurrent openProfile coverage lives in open-profile.test.ts so it can share
// one authenticated fixture setup and assert the canonical-state hash invariant.
import { describe, expect, it } from "vitest";

describe("concurrency suite", () => {
  it("is covered by open-profile integration tests", () => {
    expect(true).toBe(true);
  });
});
