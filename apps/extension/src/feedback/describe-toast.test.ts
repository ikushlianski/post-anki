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

  it("should tell the user the selection is too large for a 413", () => {
    expect(describeToast({ ok: false, reason: "too_large" }, true)).toEqual({
      kind: "error",
      text: "That selection is too large for Post Anki. Select less text.",
    });
  });

  it("should tell the user requests are being limited for a 429", () => {
    expect(describeToast({ ok: false, reason: "rate_limited" }, true).text).toContain("limiting requests");
  });

  it("should say only the first 50,000 characters were saved when the selection was cut", () => {
    expect(describeToast({ ok: true }, true, true)).toEqual({
      kind: "success",
      text: "Saved the first 50,000 characters",
    });
  });

  it("should tell the user to click the toolbar to retry when the failure is retryable", () => {
    expect(describeToast({ ok: false, reason: "rate_limited" }, true, false, true).text).toContain("Click the toolbar button to retry.");
  });

  it("should not mention retry when the failure is not retryable or the save worked", () => {
    expect(describeToast({ ok: false, reason: "bad_request" }, true, false, false).text).not.toContain("retry");
    expect(describeToast({ ok: true }, true, false, true).text).toBe("Saved to Post Anki");
  });

  it("should name the full subject path in the success toast and keep it up longer", () => {
    expect(describeToast({ ok: true }, true, false, false, { kind: "path", path: "Systems › High-load" })).toEqual({
      kind: "success",
      text: "Saved to Systems › High-load",
      durationMs: 5000,
    });
  });

  it("should name a top-level subject on its own", () => {
    expect(describeToast({ ok: true }, true, false, false, { kind: "path", path: "Systems" }).text).toBe("Saved to Systems");
  });

  it("should say the text is sorted automatically when no subject was ever chosen", () => {
    expect(describeToast({ ok: true }, true, false, false, { kind: "none" }).text).toBe(
      "Saved to Post Anki (no subject, sorted automatically)",
    );
  });

  it("should admit the destination is unknown rather than invent a name", () => {
    expect(describeToast({ ok: true }, true, false, false, { kind: "unknown" }).text).toBe(
      "Saved (subject not found in your list)",
    );
  });

  it("should keep the 50,000 character note and add the destination when the selection was cut", () => {
    expect(describeToast({ ok: true }, true, true, false, { kind: "path", path: "Systems › High-load" }).text).toBe(
      "Saved the first 50,000 characters to Systems › High-load",
    );
  });

  it("should name the destination in the already-added toast when it is known", () => {
    expect(describeToast({ ok: false, reason: "already_added" }, true, false, false, { kind: "path", path: "Systems" })).toEqual({
      kind: "info",
      text: "Already in Systems",
      durationMs: 5000,
    });
  });
});
