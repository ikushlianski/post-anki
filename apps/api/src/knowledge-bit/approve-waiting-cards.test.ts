import { describe, expect, it } from "vitest";
import { runApproveWaitingCards, type ApproveWaitingCardsClient, type WaitingCard } from "./approve-waiting-cards.js";

function card(id: string, subjectId: string | null, variants: string[] = ["v"]): WaitingCard {
  return { id, subjectId, subjectName: subjectId ? `Name ${subjectId}` : null, activeVariantIds: variants, isPhrase: false };
}

function fakeClient(initial: WaitingCard[]) {
  let waiting = initial;
  const writes: string[][] = [];
  const client: ApproveWaitingCardsClient = {
    listWaiting: async () => waiting,
    approve: async (cards) => {
      writes.push(cards.map((c) => c.id));
      waiting = waiting.filter((w) => !cards.some((c) => c.id === w.id));

      return cards.length;
    },
    countApprovedUnseen: async () => 7,
  };

  return { client, writes };
}

const seed = () => [card("a", "s1"), card("b", "s1"), card("c", "s2"), card("d", null), card("e", "s1", [])];

describe("approve waiting cards", () => {
  it("should report per-subject counts and write nothing on a dry run", async () => {
    const { client, writes } = fakeClient(seed());
    const report = await runApproveWaitingCards(client, { apply: false, includeUnassigned: false });

    expect(writes).toEqual([]);
    expect(report.perSubject).toEqual([
      { subject: "Name s1", count: 2 },
      { subject: "Name s2", count: 1 },
    ]);
    expect(report.skippedNoVariant).toBe(1);
    expect(report.skippedNoSubject).toBe(1);
    expect(report.approvedUnseenTotal).toBe(7);
  });

  it("should approve only cards with a variant and a subject on apply", async () => {
    const { client, writes } = fakeClient(seed());
    const report = await runApproveWaitingCards(client, { apply: true, includeUnassigned: false });

    expect(writes.flat().sort()).toEqual(["a", "b", "c"]);
    expect(report.approved).toBe(3);
  });

  it("should also approve subject-less cards when asked", async () => {
    const { client, writes } = fakeClient(seed());

    await runApproveWaitingCards(client, { apply: true, includeUnassigned: true });

    expect(writes.flat().sort()).toEqual(["a", "b", "c", "d"]);
  });

  it("should change nothing on a second apply", async () => {
    const { client, writes } = fakeClient(seed());

    await runApproveWaitingCards(client, { apply: true, includeUnassigned: false });
    writes.length = 0;
    const second = await runApproveWaitingCards(client, { apply: true, includeUnassigned: false });

    expect(writes).toEqual([]);
    expect(second.approved).toBe(0);
  });
});
