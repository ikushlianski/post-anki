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

  it("should keep params out of a query error nested several causes deep inside an ordinary error", () => {
    const inner = new FakeQueryError(
      'Failed query: select 1 where token = $1\nparams: nested-secret-token',
      "select 1 where token = $1",
      ["nested-secret-token"],
      new Error("root"),
    );
    const wrapper = new Error("auth failed", { cause: new Error("middle", { cause: inner }) });

    const text = JSON.stringify(serializeError(wrapper));

    expect(text).not.toContain("nested-secret-token");
    expect(text).toContain("root");
  });

  it("should stop following causes at a bounded depth", () => {
    let err = new Error("level-0", { cause: undefined });

    for (let i = 1; i < 20; i += 1) {
      err = Object.assign(new Error(`level-${i}`, { cause: err }), { params: ["p"] });
    }

    const text = JSON.stringify(serializeError(err));

    expect(text).toContain("level-18");
    expect(text).not.toContain("level-0");
  });
});
