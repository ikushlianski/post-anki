import { describe, expect, it } from "vitest";
import type { Archetype } from "@post-anki/shared";
import {
  normalizeApplicableArchetypes,
  selectArchetype,
  zeroArchetypeLastUsedAt,
  type ArchetypeLastUsedAt,
} from "./archetype-rotation";

describe("zeroArchetypeLastUsedAt", () => {
  it("returns all 5 archetype keys mapped to null (AC 3)", () => {
    expect(zeroArchetypeLastUsedAt()).toEqual({
      scenario_based: null,
      compare_contrast: null,
      design_challenge: null,
      cross_cutting: null,
      debug_challenge: null,
    });
  });
});

describe("normalizeApplicableArchetypes", () => {
  it("returns the full canonical 5-item set for an empty classification (AC 4)", () => {
    expect(normalizeApplicableArchetypes([])).toEqual([
      "scenario_based",
      "compare_contrast",
      "design_challenge",
      "cross_cutting",
      "debug_challenge",
    ]);
  });

  it("dedupes repeated archetypes (AC 5)", () => {
    expect(
      normalizeApplicableArchetypes(["scenario_based", "scenario_based", "compare_contrast"]),
    ).toEqual(["scenario_based", "compare_contrast"]);
  });
});

describe("selectArchetype", () => {
  it("always returns the single applicable archetype, suspending exclusion entirely (AC 6)", () => {
    const recentlyUsed: ArchetypeLastUsedAt = {
      ...zeroArchetypeLastUsedAt(),
      debug_challenge: "2026-08-14T00:00:00.000Z",
    };

    expect(selectArchetype(["debug_challenge"], recentlyUsed)).toBe("debug_challenge");
  });

  it("on the first session (nothing ever used), picks the earliest-canonical-order applicable candidate (AC 7)", () => {
    const applicable: Archetype[] = ["compare_contrast", "design_challenge", "cross_cutting"];

    expect(selectArchetype(applicable, zeroArchetypeLastUsedAt())).toBe("compare_contrast");
  });

  it("excludes the one real timestamp and selects among the never-used candidates (AC 8)", () => {
    const lastUsedAt: ArchetypeLastUsedAt = {
      ...zeroArchetypeLastUsedAt(),
      scenario_based: "2026-08-10T00:00:00.000Z",
    };
    const applicable: Archetype[] = ["scenario_based", "compare_contrast", "design_challenge"];

    const chosen = selectArchetype(applicable, lastUsedAt);

    expect(chosen).not.toBe("scenario_based");
    expect(["compare_contrast", "design_challenge"]).toContain(chosen);
  });

  it("excludes the maximum timestamp and picks the minimum among the rest (AC 9)", () => {
    const lastUsedAt: ArchetypeLastUsedAt = {
      scenario_based: "2026-08-10T00:00:00.000Z",
      compare_contrast: "2026-08-12T00:00:00.000Z",
      design_challenge: "2026-08-14T00:00:00.000Z",
      cross_cutting: "2026-08-08T00:00:00.000Z",
      debug_challenge: "2026-08-11T00:00:00.000Z",
    };
    const applicable = [...(Object.keys(lastUsedAt) as Archetype[])];

    expect(selectArchetype(applicable, lastUsedAt)).toBe("cross_cutting");
  });

  it("breaks an exact-timestamp tie by canonical order, earliest wins, independent of array order (AC 10)", () => {
    const tie = "2026-08-14T00:00:00.000Z";
    const lastUsedAt: ArchetypeLastUsedAt = {
      ...zeroArchetypeLastUsedAt(),
      debug_challenge: tie,
      compare_contrast: tie,
    };

    // debug_challenge is array-earlier here but canonical-later than
    // compare_contrast — canonical order must win, not array order.
    expect(selectArchetype(["debug_challenge", "compare_contrast"], lastUsedAt)).toBe(
      "compare_contrast",
    );
  });

  it("uses full timestamp comparison, not calendar-date truncation (AC 11)", () => {
    const lastUsedAt: ArchetypeLastUsedAt = {
      ...zeroArchetypeLastUsedAt(),
      // Same calendar date, but debug_challenge is chronologically older —
      // canonical order (which would favor compare_contrast, position 2 vs
      // debug_challenge's position 5) must NOT override real recency.
      compare_contrast: "2026-08-14T20:00:00.000Z",
      debug_challenge: "2026-08-14T02:00:00.000Z",
    };

    expect(selectArchetype(["compare_contrast", "debug_challenge"], lastUsedAt)).toBe(
      "debug_challenge",
    );
  });

  it("never mutates its lastUsedAt input (AC 12)", () => {
    const lastUsedAt: ArchetypeLastUsedAt = {
      ...zeroArchetypeLastUsedAt(),
      scenario_based: "2026-08-10T00:00:00.000Z",
    };
    const before = { ...lastUsedAt };

    selectArchetype(["scenario_based", "compare_contrast", "design_challenge"], lastUsedAt);

    expect(lastUsedAt).toEqual(before);
  });
});
