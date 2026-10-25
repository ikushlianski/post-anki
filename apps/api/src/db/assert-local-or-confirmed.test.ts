import { describe, expect, it } from "vitest";
import { assertLocalOrConfirmed } from "./assert-local-or-confirmed.js";

const REMOTE = "postgres://user:pw@ep-example.neon.tech/db";

describe("owner script database guard", () => {
  it("should allow a local database without any confirmation", () => {
    expect(assertLocalOrConfirmed("postgres://u:p@localhost:5562/db", {})).toBe("localhost");
    expect(assertLocalOrConfirmed("postgres://u:p@127.0.0.1:5562/db", {})).toBe("127.0.0.1");
  });

  it("should refuse a remote database unless the explicit confirmation is set", () => {
    expect(() => assertLocalOrConfirmed(REMOTE, {})).toThrow(/non-local/);
    expect(() => assertLocalOrConfirmed(REMOTE, { ALLOW_REMOTE_DB_MIGRATE: "0" })).toThrow(/non-local/);
    expect(assertLocalOrConfirmed(REMOTE, { ALLOW_REMOTE_DB_MIGRATE: "1" })).toBe("ep-example.neon.tech");
  });

  it("should not print the connection string, which carries the password", () => {
    expect(() => assertLocalOrConfirmed(REMOTE, {})).not.toThrow(/user:pw/);
  });

  it("should refuse a missing or invalid url", () => {
    expect(() => assertLocalOrConfirmed(undefined, {})).toThrow(/required/);
    expect(() => assertLocalOrConfirmed("nonsense", {})).toThrow(/valid/);
  });
});
