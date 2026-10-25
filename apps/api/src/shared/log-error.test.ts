import { describe, expect, it } from "vitest";
import { serializeError } from "./log-error.js";

class FakeQueryError extends Error {
  constructor(message: string, readonly query: string, readonly params: unknown[], cause: Error) {
    super(message, { cause });
  }
}

describe("error log serializer", () => {
  it("should keep query values such as session tokens out of logged database errors", () => {
    const cause = Object.assign(new Error("connection terminated"), { code: "57P01" });
    const err = new FakeQueryError(
      'Failed query: select * from "sessions" where token = $1\nparams: secret-session-token',
      'select * from "sessions" where token = $1',
      ["secret-session-token"],
      cause,
    );

    const serialized = serializeError(err) as Record<string, unknown>;
    const text = JSON.stringify(serialized);

    expect(text).not.toContain("secret-session-token");
    expect(serialized.message).toBe('Failed query: select * from "sessions" where token = $1');
    expect(serialized.cause).toEqual({ code: "57P01", message: "connection terminated" });
  });

  it("should leave ordinary errors untouched", () => {
    const serialized = serializeError(new Error("plain failure")) as Record<string, unknown>;

    expect(serialized.message).toBe("plain failure");
    expect(serialized.type).toBe("Error");
  });
});
