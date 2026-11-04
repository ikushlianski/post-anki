// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { PendingKnowledgeBitDuplicateOf } from "@post-anki/shared";

const api = vi.hoisted(() => ({ get: vi.fn() }));

vi.mock("./knowledge-browser-detail.api", () => ({
  getKnowledgeBrowserDetail: api.get,
}));

import { KnowledgeBitDuplicateBlock } from "./knowledge-bit-duplicate-block";

const duplicateOf: PendingKnowledgeBitDuplicateOf = {
  bitId: "old-1",
  front: "Boiling point of water?",
  back: "100 C",
  similarity: 0.93,
  reason: "Same fact, reworded.",
  similarBitIds: ["old-1", "old-2"],
};

function detail(id: string, prompt: string) {
  return {
    ok: true,
    detail: {
      knowledgeBitId: id,
      body: prompt,
      phrasings: [{ id: `${id}-v`, prompt, answer: `answer of ${id}` }],
      subjectPath: ["Science", "Physics"],
    },
  };
}

function renderBlock(
  props: Partial<React.ComponentProps<typeof KnowledgeBitDuplicateBlock>> = {},
) {
  const onReject = vi.fn();
  const onAccept = vi.fn();

  render(
    <KnowledgeBitDuplicateBlock
      bitId="new-1"
      duplicateOf={duplicateOf}
      busy={false}
      acceptDisabled={false}
      errorMessage={null}
      onReject={onReject}
      onAccept={onAccept}
      {...props}
    />,
  );

  return { onReject, onAccept };
}

async function openFirstPreview() {
  fireEvent.click(await screen.findByTestId("knowledge-bit-duplicate-similar-old-1"));
}

describe("KnowledgeBitDuplicateBlock", () => {
  beforeEach(() => {
    api.get.mockImplementation(async ({ data }: { data: { id: string } }) =>
      detail(data.id, `Front of ${data.id}`),
    );
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("should flag the pending card as a possible duplicate with the judge reason", async () => {
    renderBlock();

    expect(screen.getByTestId("knowledge-bit-duplicate-badge-new-1").textContent).toBe(
      "Possible duplicate",
    );
    expect(screen.getByText("Same fact, reworded.")).toBeTruthy();
    await screen.findByTestId("knowledge-bit-duplicate-similar-old-2");
  });

  it("should list every similar card once", async () => {
    renderBlock();

    expect(await screen.findAllByRole("button", { name: /Preview similar card/ })).toHaveLength(2);
    expect(api.get).toHaveBeenCalledTimes(2);
  });

  it("should still list the main similar card when its details fail to load", async () => {
    api.get.mockRejectedValue(new Error("boom"));
    renderBlock();

    expect(await screen.findByText("Boiling point of water?")).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain("Couldn't load 1 similar card");
  });

  it("should preview the tapped similar card with front, back and subject", async () => {
    renderBlock();
    await openFirstPreview();

    const dialog = screen.getByRole("dialog", { name: "Similar card preview" });

    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(screen.getByTestId("knowledge-bit-duplicate-front").textContent).toBe("Front of old-1");
    expect(screen.getByTestId("knowledge-bit-duplicate-back").textContent).toBe("answer of old-1");
    expect(dialog.textContent).toContain("Science / Physics");
  });

  it("should close the preview on Escape without reaching Triage shortcuts", async () => {
    const triageKey = vi.fn();

    window.addEventListener("keydown", triageKey);
    renderBlock();
    await openFirstPreview();
    fireEvent.keyDown(window, { key: "r" });
    fireEvent.keyDown(window, { key: "Escape" });

    expect(triageKey).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
    window.removeEventListener("keydown", triageKey);
  });

  it("should close the preview with the close button", async () => {
    renderBlock();
    await openFirstPreview();
    fireEvent.click(screen.getByRole("button", { name: "Close preview" }));

    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("should close the preview on a downward swipe", async () => {
    renderBlock();
    await openFirstPreview();

    const dialog = screen.getByRole("dialog");

    fireEvent.touchStart(dialog, { touches: [{ clientY: 100 }], changedTouches: [{ clientY: 100 }] });
    fireEvent.touchEnd(dialog, { touches: [], changedTouches: [{ clientY: 260 }] });

    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("should keep the preview open on a short swipe", async () => {
    renderBlock();
    await openFirstPreview();

    const dialog = screen.getByRole("dialog");

    fireEvent.touchStart(dialog, { touches: [{ clientY: 100 }], changedTouches: [{ clientY: 100 }] });
    fireEvent.touchEnd(dialog, { touches: [], changedTouches: [{ clientY: 130 }] });

    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("should reject the pending card through Reject duplicate", async () => {
    const { onReject, onAccept } = renderBlock();

    await openFirstPreview();
    fireEvent.click(screen.getByRole("button", { name: "Reject duplicate" }));

    expect(onReject).toHaveBeenCalledWith("new-1");
    expect(onAccept).not.toHaveBeenCalled();
  });

  it("should approve the pending card through Accept", async () => {
    const { onReject, onAccept } = renderBlock();

    await openFirstPreview();
    fireEvent.click(screen.getByRole("button", { name: "Accept" }));

    expect(onAccept).toHaveBeenCalledWith("new-1");
    expect(onReject).not.toHaveBeenCalled();
  });

  it("should disable both actions while the decision is in flight", async () => {
    renderBlock({ busy: true });
    await openFirstPreview();

    expect((screen.getByRole("button", { name: "Accept" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Reject duplicate" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("should show the failure text in the preview only after an action was tried", async () => {
    renderBlock({ errorMessage: "Couldn't reject. Try again." });
    await openFirstPreview();

    expect(screen.queryByTestId("knowledge-bit-duplicate-error")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Reject duplicate" }));

    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toBe("Couldn't reject. Try again."),
    );
  });
});
