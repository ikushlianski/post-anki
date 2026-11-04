import { describe, expect, it } from "vitest";
import type { AdminSettings } from "@/api/settings-commands";
import { buildAdminPatch, draftFromAdminSettings } from "@/settings-admin-patch";

const SAVED: AdminSettings = {
  modelTier: "cheap",
  newCardsPerDay: 20,
  learningStepsMinutes: [1, 10],
  relearningStepsMinutes: [10],
  desiredRetention: 0.9,
};

describe("buildAdminPatch", () => {
  it("should send nothing when no admin value was edited", () => {
    expect(buildAdminPatch(draftFromAdminSettings(SAVED), SAVED)).toEqual({ ok: true, value: {} });
  });

  it("should send only the edited model tier", () => {
    const draft = { ...draftFromAdminSettings(SAVED), modelTier: "premium" as const };

    expect(buildAdminPatch(draft, SAVED)).toEqual({ ok: true, value: { modelTier: "premium" } });
  });

  it("should leave out any field the API did not return for this account", () => {
    const partial: AdminSettings = { ...SAVED, modelTier: null, desiredRetention: null };
    const draft = { ...draftFromAdminSettings(partial), retention: "99" };

    expect(buildAdminPatch(draft, partial)).toEqual({ ok: true, value: {} });
  });

  it("should refuse a relearning step list that is empty", () => {
    const draft = { ...draftFromAdminSettings(SAVED), relearningSteps: "" };

    expect(buildAdminPatch(draft, SAVED).ok).toBe(false);
  });
});
