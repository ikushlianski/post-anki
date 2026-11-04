// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { PendingKnowledgeBitForReview } from "@post-anki/shared";

const api = vi.hoisted(() => ({ get: vi.fn() }));

vi.mock("./knowledge-browser-detail.api", () => ({
  getKnowledgeBrowserDetail: api.get,
}));

import { KnowledgeBitFocusCard } from "./knowledge-bit-focus-card";

const bit = {
  id: "new-1",
  body: "Water boils at 100 C.",
  background: null,
  origin: "extracted",
  isAiGenerated: false,
  sourceLinks: [],
  variants: [{ id: "v1", kind: "basic", prompt: "Boiling point?", answer: "100 C" }],
  duplicateOf: {
    bitId: "old-1",
    front: "Boiling point of water?",
    back: "100 C",
    similarity: 0.9,
    reason: "Same fact.",
    similarBitIds: ["old-1"],
  },
} as PendingKnowledgeBitForReview;

function renderCard(withDuplicate: boolean) {
  const onApprove = vi.fn();
  const onReject = vi.fn();

  api.get.mockResolvedValue({ ok: false, error: "not_found" });
  render(
    <KnowledgeBitFocusCard
      bit={withDuplicate ? bit : { ...bit, duplicateOf: null }}
      subjectName="Science"
      sourceText={null}
      isResolving={false}
      onApprove={onApprove}
      onReject={onReject}
      onSaveVariant={vi.fn(async () => true)}
      onSaveBit={vi.fn(async () => true)}
    />,
  );

  return { onApprove, onReject };
}

describe("KnowledgeBitFocusCard duplicate flag", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("should keep a flagged duplicate in Triage marked as a possible duplicate", async () => {
    renderCard(true);

    expect(screen.getByTestId("knowledge-bit-duplicate-badge-new-1")).toBeTruthy();
    expect(await screen.findByText("Boiling point of water?")).toBeTruthy();
  });

  it("should show no duplicate marker on a normal card", () => {
    renderCard(false);

    expect(screen.queryByTestId("knowledge-bit-duplicate-badge-new-1")).toBeNull();
  });

  it("should reject the pending card from the similar card preview", async () => {
    const { onReject } = renderCard(true);

    fireEvent.click(await screen.findByTestId("knowledge-bit-duplicate-similar-old-1"));
    fireEvent.click(screen.getByRole("button", { name: "Reject duplicate" }));

    expect(onReject).toHaveBeenCalledWith("new-1");
  });

  it("should keep the card's own Triage shortcut buttons working", () => {
    const { onApprove } = renderCard(true);

    fireEvent.click(screen.getByTestId("knowledge-bit-focus-approve-new-1"));

    expect(onApprove).toHaveBeenCalledWith("new-1");
  });
});
