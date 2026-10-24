import { describe, expect, it } from "vitest";

import { describeToast } from "./describe-toast.js";

describe("describeToast", () => {
  it("should confirm a saved selection in plain words", () => {
    expect(describeToast({ ok: true }, true)).toEqual({ kind: "success", text: "Saved to Post Anki" });
  });

  it("should tell the user to set a token when none is configured", () => {
    const toast = describeToast({ ok: false, reason: "unauthorized" }, false);

    expect(toast.kind).toBe("error");
    expect(toast.text).toContain("No token set");
  });

  it("should say the token was rejected when one is set but the server refuses it", () => {
    expect(describeToast({ ok: false, reason: "unauthorized" }, true).text).toContain("rejected your token");
  });

  it("should say the server cannot be reached on a network failure", () => {
    expect(describeToast({ ok: false, reason: "network" }, true).text).toContain("Can't reach");
  });

  it("should show a neutral message for a duplicate instead of an error", () => {
    expect(describeToast({ ok: false, reason: "already_added" }, true)).toEqual({
      kind: "info",
      text: "Already in Post Anki",
    });
  });

  it("should explain rejected text, forbidden and server errors without codes", () => {
    expect(describeToast({ ok: false, reason: "bad_request" }, true).text).toContain("empty or too long");
    expect(describeToast({ ok: false, reason: "forbidden" }, true).text).toContain("isn't allowed");
    expect(describeToast({ ok: false, reason: "unexpected", status: 500 }, true).text).toContain("server problem");
  });
});
