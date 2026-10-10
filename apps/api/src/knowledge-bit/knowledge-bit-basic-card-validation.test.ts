import { describe, expect, it } from "vitest";
import { validateBasicCard } from "./knowledge-bit-basic-card-validation.js";

describe("validateBasicCard", () => {
  it("should accept a short question with its plain answer and trim both sides", () => {
    expect(
      validateBasicCard({ front: "  What does TTL stand for? ", back: " Time to live " }),
    ).toEqual({ ok: true, front: "What does TTL stand for?", back: "Time to live" });
  });

  it("should reject a card with a blank side", () => {
    expect(validateBasicCard({ front: "  ", back: "Time to live" })).toEqual({
      ok: false,
      reason: "empty",
    });
    expect(validateBasicCard({ front: "What is TTL?", back: "" })).toEqual({
      ok: false,
      reason: "empty",
    });
  });

  it("should reject a front over 300 chars or a back over 600 chars", () => {
    expect(validateBasicCard({ front: "q".repeat(301), back: "a" })).toEqual({
      ok: false,
      reason: "too_long",
    });
    expect(validateBasicCard({ front: "q", back: "a".repeat(601) })).toEqual({
      ok: false,
      reason: "too_long",
    });
  });

  it("should reject a front identical to the back ignoring case and spacing", () => {
    expect(validateBasicCard({ front: "Time  to live", back: "time to LIVE" })).toEqual({
      ok: false,
      reason: "same_text",
    });
  });

  it("should reject a front that gives the answer away", () => {
    expect(
      validateBasicCard({ front: "Is it true that TTL means time to live?", back: "Time to live" }),
    ).toEqual({ ok: false, reason: "answer_on_front" });
  });

  it("should not flag a very short answer found inside the question", () => {
    expect(validateBasicCard({ front: "What is 2 + 2?", back: "4" })).toEqual({
      ok: true,
      front: "What is 2 + 2?",
      back: "4",
    });
  });
});
