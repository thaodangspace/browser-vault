import { describe, expect, it } from "vitest";
import { validateHttpUrl } from "../../src/utils/http-url.js";

describe("validateHttpUrl", () => {
  it.each(["https://asprdt.vsee.io", "http://localhost:3000/path"])("accepts %s", (url) => {
    expect(validateHttpUrl(url)).toMatch(/^https?:\/\//);
  });

  it.each(["not-a-url", "file:///vault/profiles/github/storage-state.json", "javascript:alert(1)"])("rejects %s", (url) => {
    expect(() => validateHttpUrl(url)).toThrow("http:// or https://");
  });
});
