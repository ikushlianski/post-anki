import { describe, expect, it } from "vitest";
import { deriveSuspensionChange } from "./knowledge-bit-review-suspension.js";

const now = new Date("2026-10-10T10:00:00Z");
const buryUntil = new Date("2026-10-11T00:00:00Z");
const earlier = new Date("2026-10-01T00:00:00Z");

describe("deriveSuspensionChange", () => {
  it("should suspend a card from now when it was not suspended", () => {
    expect(deriveSuspensionChange({ current: null, input: { suspended: true }, now, buryUntil })).toEqual({
      suspendedAt: now,
      buriedUntil: null,
    });
  });

  it("should keep the original suspension time when suspended again", () => {
    const current = { suspendedAt: earlier, buriedUntil: null };

    expect(deriveSuspensionChange({ current, input: { suspended: true }, now, buryUntil }).suspendedAt).toBe(
      earlier,
    );
  });

  it("should put a suspended card back in rotation", () => {
    const current = { suspendedAt: earlier, buriedUntil: null };

    expect(deriveSuspensionChange({ current, input: { suspended: false }, now, buryUntil }).suspendedAt).toBeNull();
  });

  it("should bury until the end of the learner's day and clear it again", () => {
    const buried = deriveSuspensionChange({ current: null, input: { buried: true }, now, buryUntil });

    expect(buried.buriedUntil).toBe(buryUntil);
    expect(
      deriveSuspensionChange({ current: buried, input: { buried: false }, now, buryUntil }).buriedUntil,
    ).toBeNull();
  });

  it("should leave the other control untouched when its key is absent", () => {
    const current = { suspendedAt: earlier, buriedUntil: buryUntil };

    expect(deriveSuspensionChange({ current, input: { buried: false }, now, buryUntil })).toEqual({
      suspendedAt: earlier,
      buriedUntil: null,
    });
  });
});
