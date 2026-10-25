import { describe, expect, it } from "vitest";
import { assertDevDbIsLocal } from "./assert-dev-db-is-local.js";

const remote = "postgresql://u:p@ep-example.neon.tech/neondb";
const local = "postgresql://u:p@localhost:5562/postanki_dev";

describe("assertDevDbIsLocal", () => {
  it("should stop a development run that points at the production Neon database", () => {
    expect(() => assertDevDbIsLocal({ NODE_ENV: "development", DATABASE_URL: remote })).toThrow(/non-local/);
  });

  it("should let a development run use the local Postgres container", () => {
    expect(() => assertDevDbIsLocal({ DATABASE_URL: local })).not.toThrow();
  });

  it("should let production use its remote database", () => {
    expect(() => assertDevDbIsLocal({ NODE_ENV: "production", DATABASE_URL: remote })).not.toThrow();
  });

  it("should allow a remote database in development only when explicitly confirmed", () => {
    expect(() => assertDevDbIsLocal({ DATABASE_URL: remote, ALLOW_REMOTE_DEV_DB: "1" })).not.toThrow();
  });
});
