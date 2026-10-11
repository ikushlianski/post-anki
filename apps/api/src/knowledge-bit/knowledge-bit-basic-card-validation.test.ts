import { describe, expect, it } from "vitest";
import { validateBasicCard } from "./knowledge-bit-basic-card-validation.js";

const SOURCE = "TTL means time to live.";

describe("validateBasicCard", () => {
  it("should accept a short question with its plain answer and trim both sides", () => {
    expect(
      validateBasicCard({ front: "  What does TTL stand for? ", back: " Time to live " }, SOURCE),
    ).toEqual({ ok: true, front: "What does TTL stand for?", back: "Time to live" });
  });

  it("should reject a card with a blank side", () => {
    expect(validateBasicCard({ front: "  ", back: "Time to live" }, SOURCE)).toEqual({
      ok: false,
      reason: "empty",
    });
    expect(validateBasicCard({ front: "What is TTL?", back: "" }, SOURCE)).toEqual({
      ok: false,
      reason: "empty",
    });
  });

  it("should reject a front over 300 chars or a back over 600 chars", () => {
    expect(validateBasicCard({ front: "q".repeat(301), back: "a" }, SOURCE)).toEqual({
      ok: false,
      reason: "too_long",
    });
    expect(validateBasicCard({ front: "q", back: "a".repeat(601) }, SOURCE)).toEqual({
      ok: false,
      reason: "too_long",
    });
  });

  it("should reject a front identical to the back ignoring case and spacing", () => {
    expect(validateBasicCard({ front: "Time  to live", back: "time to LIVE" }, SOURCE)).toEqual({
      ok: false,
      reason: "same_text",
    });
  });

  it("should reject a front that gives the answer away", () => {
    expect(
      validateBasicCard({ front: "Is it true that TTL means time to live?", back: "Time to live" }, SOURCE),
    ).toEqual({ ok: false, reason: "answer_on_front" });
  });

  it("should not flag a very short answer found inside the question", () => {
    expect(validateBasicCard({ front: "What is 2 + 2?", back: "4" }, "Two plus two is four.")).toEqual({
      ok: true,
      front: "What is 2 + 2?",
      back: "4",
    });
  });

  it("should reject a card written in a different script than the source", () => {
    expect(
      validateBasicCard({ front: "生存时间是什么意思？", back: "时间到期前的存活时长" }, SOURCE),
    ).toEqual({ ok: false, reason: "wrong_language" });
  });

  it("should accept a Chinese card generated from a Chinese source", () => {
    expect(
      validateBasicCard(
        { front: "生存时间是什么意思？", back: "时间到期前的存活时长" },
        "TTL 表示生存时间。",
      ),
    ).toEqual({ ok: true, front: "生存时间是什么意思？", back: "时间到期前的存活时长" });
  });

  it("should reject a card that refers to the source instead of standing on its own", () => {
    expect(
      validateBasicCard({ front: "What does the bit say TTL means?", back: "Time to live" }, SOURCE),
    ).toEqual({ ok: false, reason: "source_meta_reference" });
  });
});
