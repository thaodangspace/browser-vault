import { Writable } from "node:stream";
import { describe, expect, it } from "vitest";
import { createLogger } from "../../src/utils/logger.js";

describe("logger redaction", () => {
  it("redacts credential-shaped fields", () => {
    let output = "";
    const destination = new Writable({
      write(chunk, _encoding, callback) {
        output += chunk.toString();
        callback();
      },
    });
    const secrets = {
      cookies: "cookie-secret",
      token: "token-secret",
      password: "password-secret",
      authorization: "authorization-secret",
    };

    createLogger(destination).info(secrets, "test");

    for (const secret of Object.values(secrets)) {
      expect(output).not.toContain(secret);
    }
    expect(output).toContain("[Redacted]");
  });
});
