import { describe, expect, it } from "vitest";
import { assertReextractTarget, parseReextractArgs } from "./knowledge-source-reextract.js";

describe("parseReextractArgs", () => {
  it("should default to a dry run on every subject", () => {
    expect(parseReextractArgs([])).toEqual({ apply: false, allowRemote: false, subjectId: undefined });
  });

  it("should read apply, allow-remote and the subject filter", () => {
    expect(parseReextractArgs(["--apply", "--allow-remote", "--subject", "subj_1"])).toEqual({
      apply: true,
      allowRemote: true,
      subjectId: "subj_1",
    });
  });

  it("should reject a subject flag without an id so it cannot silently widen to every subject", () => {
    expect(() => parseReextractArgs(["--subject"])).toThrow("--subject needs a subject id");
    expect(() => parseReextractArgs(["--subject", "--apply"])).toThrow("--subject needs a subject id");
  });
});

describe("assertReextractTarget", () => {
  it("should accept a local database", () => {
    expect(() => assertReextractTarget("postgres://u:p@localhost:5562/postanki_dev", false)).not.toThrow();
  });

  it("should refuse a remote database unless remote is explicitly allowed", () => {
    expect(() => assertReextractTarget("postgres://u:p@db.example.com:5432/app", false)).toThrow(
      /not in the local allowlist/,
    );
    expect(() => assertReextractTarget("postgres://u:p@db.example.com:5432/app", true)).not.toThrow();
  });

  it("should refuse a missing database url", () => {
    expect(() => assertReextractTarget(undefined, true)).toThrow("DATABASE_URL is required");
  });
});
