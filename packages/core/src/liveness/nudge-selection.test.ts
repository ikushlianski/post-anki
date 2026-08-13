import { describe, expect, it } from "vitest";
import {
  LIVENESS_GENERATION_THRESHOLD,
  LIVENESS_MIN_SCORE,
  LIVENESS_NUDGE_THRESHOLD,
} from "./liveness-constants";
import { computeLiveness } from "./liveness";
import { NUDGE_RELATED_LIMIT, selectNudge, type NudgeCandidate } from "./nudge-selection";

const NOW = "2026-08-07T00:00:00.000Z";

function daysAgo(days: number): string {
  return new Date(new Date(NOW).getTime() - days * 24 * 60 * 60 * 1000).toISOString();
}

function candidate(overrides: Partial<NudgeCandidate> = {}): NudgeCandidate {
  return {
    entityType: "learning_list_item",
    entityId: "item-1",
    name: "Security for agentic AI on AWS",
    score: LIVENESS_NUDGE_THRESHOLD,
    lastNudgeAt: null,
    lastNudgeResponse: null,
    groupKey: "subject-web",
    ...overrides,
  };
}

describe("selectNudge", () => {
  it("asks about a decayed item by name", () => {
    const selection = selectNudge([candidate()], NOW);

    expect(selection?.target.name).toBe("Security for agentic AI on AWS");
  });

  it("stays quiet while everything is still being worked on", () => {
    expect(
      selectNudge([candidate({ score: LIVENESS_GENERATION_THRESHOLD })], NOW),
    ).toBeNull();
  });

  it("never asks about an entity whose liveness was never established", () => {
    expect(selectNudge([candidate({ score: null })], NOW)).toBeNull();
  });

  it("never re-asks about a declined item, even long after the nudge cooldown has elapsed", () => {
    const declined = candidate({
      lastNudgeResponse: "no",
      lastNudgeAt: daysAgo(30),
      score: LIVENESS_MIN_SCORE,
    });

    expect(selectNudge([declined], NOW)).toBeNull();
  });

  it("still asks about an item the learner previously revived once the cooldown has elapsed", () => {
    const revived = candidate({
      lastNudgeResponse: "yes",
      lastNudgeAt: daysAgo(30),
      score: LIVENESS_MIN_SCORE,
    });

    expect(selectNudge([revived], NOW)?.target.entityId).toBe("item-1");
  });

  it("stays quiet during the cooldown after a nudge was already answered", () => {
    const recentlyAsked = candidate({
      lastNudgeResponse: "yes",
      lastNudgeAt: daysAgo(2),
      score: LIVENESS_MIN_SCORE,
    });

    expect(selectNudge([recentlyAsked], NOW)).toBeNull();
  });

  it("asks about the most decayed item first", () => {
    const selection = selectNudge(
      [
        candidate({ entityId: "item-1", name: "Nearly alive", score: 4 }),
        candidate({ entityId: "item-2", name: "Almost gone", score: 1 }),
      ],
      NOW,
    );

    expect(selection?.target.entityId).toBe("item-2");
  });

  it("surfaces related items from the same subject rather than asking generically", () => {
    const selection = selectNudge(
      [
        candidate({ entityId: "item-1", name: "Target", score: 1 }),
        candidate({ entityId: "item-2", name: "Sibling", score: 3 }),
        candidate({ entityId: "item-3", name: "Elsewhere", score: 2, groupKey: "subject-db" }),
      ],
      NOW,
    );

    expect(selection?.target.entityId).toBe("item-1");
    expect(selection?.related.map((item) => item.entityId)).toEqual(["item-2"]);
  });

  it("never lists the nudged item among its own related items", () => {
    const selection = selectNudge([candidate({ entityId: "item-1" })], NOW);

    expect(selection?.related).toEqual([]);
  });

  it("never lists a declined item as related to a live nudge", () => {
    const selection = selectNudge(
      [
        candidate({ entityId: "item-1", name: "Target", score: 1 }),
        candidate({
          entityId: "item-2",
          name: "Declined sibling",
          score: LIVENESS_MIN_SCORE,
          lastNudgeAt: daysAgo(30),
          lastNudgeResponse: "no",
        }),
      ],
      NOW,
    );

    expect(selection?.related).toEqual([]);
  });

  it("caps how many related items ride along with a single nudge", () => {
    const selection = selectNudge(
      [
        candidate({ entityId: "target", name: "Target", score: 1 }),
        ...Array.from({ length: 6 }, (_, i) =>
          candidate({ entityId: `sib-${i}`, name: `Sibling ${i}`, score: 3 }),
        ),
      ],
      NOW,
    );

    expect(selection?.related).toHaveLength(NUDGE_RELATED_LIMIT);
  });

  it("nudges about a paused curriculum on the same scale as a captured article", () => {
    const selection = selectNudge(
      [
        candidate({
          entityType: "curriculum",
          entityId: "cur-1",
          name: "React Native",
          score: computeLiveness(
            {
              lastActivityAt: daysAgo(60),
              lastNudgeAt: null,
              lastNudgeResponse: null,
              baseScore: null,
            },
            NOW,
          ),
        }),
      ],
      NOW,
    );

    expect(selection?.target.entityType).toBe("curriculum");
    expect(selection?.target.name).toBe("React Native");
  });
});
