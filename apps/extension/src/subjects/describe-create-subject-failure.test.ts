import { describe, expect, it } from "vitest";
import { describeCreateSubjectFailure } from "./describe-create-subject-failure.js";

describe("describeCreateSubjectFailure", () => {
  it("should tell the user to type a name when the name is empty", () => {
    expect(describeCreateSubjectFailure({ ok: false, reason: "empty_name" })).toBe("Type a name for the subject first.");
  });

  it("should point to the token when the API rejects the credentials", () => {
    expect(describeCreateSubjectFailure({ ok: false, reason: "unauthorized" })).toContain("token");
  });

  it("should say the API is unreachable on a network failure", () => {
    expect(describeCreateSubjectFailure({ ok: false, reason: "network" })).toContain("could not be reached");
  });

  it("should give a retry hint for other failures without leaking the raw reason", () => {
    const message = describeCreateSubjectFailure({ ok: false, reason: "other" });

    expect(message).toContain("Try again");
    expect(message).not.toContain("other");
  });
});
