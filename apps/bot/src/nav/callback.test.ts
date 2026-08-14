import { describe, it, expect } from "vitest";
import { parseCallback, buildCallback } from "./callback.js";

describe("parseCallback", () => {
  it("parses a prefixed id", () => {
    expect(parseCallback("cur:abc-123")).toEqual({
      kind: "curriculum",
      arg: "abc-123",
    });
  });

  it("parses an answer index", () => {
    expect(parseCallback("qa:2")).toEqual({ kind: "answer", arg: "2" });
  });

  it("parses a bare prefix with no arg", () => {
    expect(parseCallback("qnext")).toEqual({ kind: "next", arg: "" });
  });

  it("treats an id with colons as part of the arg", () => {
    expect(parseCallback("top:a:b:c")).toEqual({ kind: "topic", arg: "a:b:c" });
  });

  it("falls back to noop for an unknown prefix", () => {
    expect(parseCallback("zzz:1")).toEqual({ kind: "noop", arg: "" });
  });
});

describe("buildCallback", () => {
  it("round-trips with parseCallback", () => {
    expect(parseCallback(buildCallback("subject", "s1"))).toEqual({
      kind: "subject",
      arg: "s1",
    });
  });

  it("emits a bare prefix when arg is empty", () => {
    expect(buildCallback("next")).toBe("qnext");
  });

  it("round-trips the save_for_next kind (AC 25)", () => {
    expect(buildCallback("save_for_next")).toBe("sv");
    expect(parseCallback(buildCallback("save_for_next"))).toEqual({
      kind: "save_for_next",
      arg: "",
    });
  });

  it.each([
    "triage_important",
    "triage_defer",
    "triage_dismiss",
    "triage_dismiss_shortcut",
    "checkin_confirm",
    "checkin_revisit",
  ] as const)("round-trips the gap-triage kind %s with its gap id", (kind) => {
    expect(parseCallback(buildCallback(kind, "gap_1"))).toEqual({ kind, arg: "gap_1" });
  });

  it("keeps every gap-triage callback_data well under Telegram's 64-byte limit for a typical gap id", () => {
    const gapId = `gap_${"a".repeat(36)}`;

    for (const kind of [
      "triage_important",
      "triage_defer",
      "triage_dismiss",
      "triage_dismiss_shortcut",
      "checkin_confirm",
      "checkin_revisit",
    ] as const) {
      expect(buildCallback(kind, gapId).length).toBeLessThanOrEqual(64);
    }
  });
});
