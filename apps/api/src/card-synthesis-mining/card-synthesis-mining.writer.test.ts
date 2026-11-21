import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../mastra/card-synthesis-writer.agent.js", () => ({ runCardSynthesisWriter: vi.fn() }));

import { runCardSynthesisWriter } from "../mastra/card-synthesis-writer.agent.js";
import { UngroundedOverviewError, type EvidenceCard } from "./card-synthesis-mining.types.js";
import { writeOverview } from "./card-synthesis-mining.writer.js";

const cards: EvidenceCard[] = [1, 2, 3].map((n) => ({ id: `kb_${n}`, question: `Q${n}`, answer: `A${n}` }));
const step = (technique: string, ids: string[]) => ({ technique, text: `${technique} text`, evidenceCardIds: ids });

beforeEach(() => {
  vi.resetAllMocks();
});

describe("writeOverview", () => {
  it("should map cited aliases back to real bit ids", async () => {
    vi.mocked(runCardSynthesisWriter).mockResolvedValue({
      lead: "Lead.",
      steps: [step("One", ["K1"]), step("Two", ["k2", "K9"]), step("Three", ["K3"])],
    });

    const draft = await writeOverview(cards, "Title here", {});

    expect(draft.steps.map((s) => s.evidenceBitIds)).toEqual([["kb_1"], ["kb_2"], ["kb_3"]]);
  });

  it("should reject a step whose only citation is an invented alias", async () => {
    vi.mocked(runCardSynthesisWriter).mockResolvedValue({
      lead: "Lead.",
      steps: [step("One", ["K1"]), step("Two", ["K42"]), step("Three", ["K3"])],
    });

    await expect(writeOverview(cards, "Title here", {})).rejects.toBeInstanceOf(UngroundedOverviewError);
  });

  it("should reject an overview with fewer than three steps", async () => {
    vi.mocked(runCardSynthesisWriter).mockResolvedValue({ lead: "Lead.", steps: [step("One", ["K1"])] });

    await expect(writeOverview(cards, "Title here", {})).rejects.toBeInstanceOf(UngroundedOverviewError);
  });
});
