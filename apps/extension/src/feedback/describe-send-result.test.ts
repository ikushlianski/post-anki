import { describe, expect, it } from "vitest";

import { describeSendResult } from "./describe-send-result.js";

const baseUrl = "http://localhost:5560";

describe("describeSendResult", () => {
  it("should tell the user the text was saved on 201", () => {
    expect(describeSendResult({ ok: true }, baseUrl)).toEqual({ badge: "OK", title: "Saved" });
  });

  it("should explain a 400 as invalid or too long text", () => {
    expect(describeSendResult({ ok: false, reason: "bad_request" }, baseUrl)).toEqual({
      badge: "ERR",
      title: "Rejected: text invalid or too long",
    });
  });

  it("should show an already-added state, not an error, when the selection was sent before", () => {
    expect(describeSendResult({ ok: false, reason: "already_added" }, baseUrl)).toEqual({
      badge: "DUP",
      title: "Already added: this selection is already in post-anki",
    });
  });

  it("should explain a 401 as a rejected token", () => {
    expect(describeSendResult({ ok: false, reason: "unauthorized" }, baseUrl).title).toBe(
      "Token rejected (401)",
    );
  });

  it("should point to EXTENSION_ID on a 403", () => {
    expect(describeSendResult({ ok: false, reason: "forbidden" }, baseUrl).title).toBe(
      "Extension not allowed (403): set EXTENSION_ID in the API env",
    );
  });

  it("should show the status for other HTTP errors such as 500", () => {
    expect(describeSendResult({ ok: false, reason: "unexpected", status: 500 }, baseUrl)).toEqual({
      badge: "ERR",
      title: "API error (500)",
    });
  });

  it("should name the unreachable API address on a network failure", () => {
    expect(describeSendResult({ ok: false, reason: "network" }, "http://localhost:9999")).toEqual({
      badge: "ERR",
      title: "API not reachable at http://localhost:9999",
    });
  });
});
