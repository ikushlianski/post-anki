// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import type { PendingKnowledgeBitForReview } from "@post-anki/shared";

import { KnowledgeBitFocusCard } from "./knowledge-bit-focus-card";
import { KnowledgeBitFocusShell } from "./knowledge-bit-focus-shell";

function makeBit(
  overrides: Partial<PendingKnowledgeBitForReview> = {},
): PendingKnowledgeBitForReview {
  return {
    id: "bit-1",
    body: "Water boils at 100 C at sea level.",
    background: "Kettle example",
    origin: "extracted",
    isAiGenerated: false,
    sourceLinks: [],
    variants: [
      {
        id: "v1",
        prompt: "At what temperature does water boil?",
        answer: "100 C",
      },
      { id: "v2", prompt: "What boils at 100 C?", answer: "Water" },
    ],
    ...overrides,
  } as PendingKnowledgeBitForReview;
}

function renderCard(
  bit = makeBit(),
  props: Partial<React.ComponentProps<typeof KnowledgeBitFocusCard>> = {},
) {
  const handlers = {
    onApprove: vi.fn(),
    onReject: vi.fn(),
    onSaveVariant: vi.fn(async () => true),
    onSaveBit: vi.fn(async () => true),
  };

  render(
    <KnowledgeBitFocusCard
      bit={bit}
      subjectName="Physics"
      sourceText="Original paragraph"
      isResolving={false}
      {...handlers}
      {...props}
    />,
  );

  return handlers;
}

afterEach(cleanup);

describe("KnowledgeBitFocusCard", () => {
  it("should edit a cloze bit as one note and hand the text to the note saver", async () => {
    const bit = makeBit({
      variants: [
        {
          id: "c1",
          kind: "cloze",
          prompt: "The ____ is blue",
          answer: "sky",
          sentence: "The {{c1::sky}} is blue",
        },
      ],
    });
    const onSaveNote = vi.fn(async () => true);

    renderCard(bit, { onSaveNote });

    expect(
      screen.queryByTestId("knowledge-bit-review-edit-prompt-c1"),
    ).toBeNull();
    fireEvent.change(
      screen.getByTestId("knowledge-bit-review-edit-note-bit-1"),
      {
        target: { value: "The {{c1::sea}} is blue" },
      },
    );

    await waitFor(
      () =>
        expect(onSaveNote).toHaveBeenCalledWith(
          "bit-1",
          "c1",
          "cloze",
          "The {{c1::sea}} is blue",
        ),
      {
        timeout: 3000,
      },
    );
  });

  it("should show one card with its statement, subject and editable front and back", () => {
    renderCard();

    expect(screen.getByTestId("knowledge-bit-focus-subject").textContent).toBe(
      "Physics",
    );
    expect(screen.getByRole("heading").textContent).toBe(
      "Water boils at 100 C at sea level.",
    );
    expect(
      (
        screen.getByTestId(
          "knowledge-bit-review-edit-prompt-v1",
        ) as HTMLTextAreaElement
      ).value,
    ).toBe("At what temperature does water boil?");
    expect(
      (
        screen.getByTestId(
          "knowledge-bit-review-edit-answer-v1",
        ) as HTMLTextAreaElement
      ).value,
    ).toBe("100 C");
    expect(
      screen.getByRole("button", { name: /Hide variations/ }),
    ).toBeTruthy();
    expect(
      screen
        .getByTestId("knowledge-bit-review-variations-bit-1")
        .hasAttribute("hidden"),
    ).toBe(false);
  });

  it("should show which models produced a fusion candidate next to its keep and reject buttons", () => {
    const handlers = renderCard(makeBit({ modelIds: ["openai/gpt-5", "anthropic/claude-x"] }));

    expect(screen.getByText("gpt-5")).toBeTruthy();
    expect(screen.getByText("claude-x")).toBeTruthy();

    fireEvent.click(screen.getByTestId("knowledge-bit-focus-approve-bit-1"));

    expect(handlers.onApprove).toHaveBeenCalledWith("bit-1");
  });

  it("should keep the statement read-only", () => {
    renderCard();

    expect(screen.getByRole("heading").tagName).toBe("H2");
    expect(
      screen.queryByDisplayValue("Water boils at 100 C at sea level."),
    ).toBeNull();
  });

  it("should move focus to the statement heading when the card appears", () => {
    renderCard();

    expect(document.activeElement).toBe(screen.getByRole("heading"));
  });

  it("should move focus to the next card heading when the card changes", () => {
    const { rerender } = render(
      <KnowledgeBitFocusCard
        bit={makeBit()}
        subjectName={null}
        sourceText={null}
        isResolving={false}
        onApprove={vi.fn()}
        onReject={vi.fn()}
        onSaveVariant={vi.fn(async () => true)}
        onSaveBit={vi.fn(async () => true)}
      />,
    );

    rerender(
      <KnowledgeBitFocusCard
        bit={makeBit({ id: "bit-2", body: "Second statement" })}
        subjectName={null}
        sourceText={null}
        isResolving={false}
        onApprove={vi.fn()}
        onReject={vi.fn()}
        onSaveVariant={vi.fn(async () => true)}
        onSaveBit={vi.fn(async () => true)}
      />,
    );

    expect(document.activeElement?.textContent).toBe("Second statement");
  });

  it("should place Reject on the left and Approve on the right and call them with the bit id", () => {
    const handlers = renderCard();
    const buttons = screen
      .getAllByRole("button")
      .filter((b) => /^(←)?Reject$|^Approve(→)?$/.test(b.textContent ?? ""));

    expect(buttons.map((b) => b.textContent?.replace(/[←→]/g, ""))).toEqual([
      "Reject",
      "Approve",
    ]);

    fireEvent.click(screen.getByRole("button", { name: "Reject" }));
    fireEvent.click(screen.getByRole("button", { name: "Approve" }));

    expect(handlers.onReject).toHaveBeenCalledWith("bit-1");
    expect(handlers.onApprove).toHaveBeenCalledWith("bit-1");
  });

  it("should give both decision buttons a 44px or larger touch height", () => {
    renderCard();

    expect(screen.getByRole("button", { name: "Reject" }).className).toContain(
      "min-h-12",
    );
    expect(screen.getByRole("button", { name: "Approve" }).className).toContain(
      "min-h-12",
    );
  });

  it("should show the loader only on the button that was pressed while it saves", () => {
    const { rerender } = render(
      <KnowledgeBitFocusCard
        bit={makeBit()}
        subjectName="Physics"
        sourceText={null}
        isResolving={false}
        onApprove={vi.fn()}
        onReject={vi.fn()}
        onSaveVariant={vi.fn(async () => true)}
        onSaveBit={vi.fn(async () => true)}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Approve" }));
    rerender(
      <KnowledgeBitFocusCard
        bit={makeBit()}
        subjectName="Physics"
        sourceText={null}
        isResolving
        onApprove={vi.fn()}
        onReject={vi.fn()}
        onSaveVariant={vi.fn(async () => true)}
        onSaveBit={vi.fn(async () => true)}
      />,
    );

    expect(screen.getAllByTestId("knowledge-bit-focus-spinner")).toHaveLength(
      1,
    );
    expect(
      screen
        .getByRole("button", { name: "Approve" })
        .querySelector('[data-testid="knowledge-bit-focus-spinner"]'),
    ).not.toBeNull();
  });

  it("should show the original fact and its source above the question fields", () => {
    renderCard();

    const fact = screen.getByTestId("knowledge-bit-focus-fact");
    const prompt = screen.getByTestId("knowledge-bit-review-edit-prompt-v1");

    expect(
      fact.compareDocumentPosition(prompt) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      screen.getByTestId("knowledge-bit-focus-source").textContent,
    ).toContain("Physics");
    expect(
      screen.getByTestId("knowledge-bit-focus-source-text").textContent,
    ).toBe("Original paragraph");
  });

  it("should keep a short source fully visible without a show-more control", () => {
    renderCard();

    expect(
      screen.queryByTestId("knowledge-bit-focus-source-toggle"),
    ).toBeNull();
    expect(
      screen.getByTestId("knowledge-bit-focus-source-text").className,
    ).not.toContain("line-clamp");
  });

  it("should collapse a source longer than four lines until the reviewer expands it", () => {
    renderCard(makeBit(), { sourceText: "a\nb\nc\nd\ne\nf" });

    const text = screen.getByTestId("knowledge-bit-focus-source-text");
    const toggle = screen.getByTestId("knowledge-bit-focus-source-toggle");

    expect(text.className).toContain("line-clamp-4");
    fireEvent.click(toggle);
    expect(text.className).not.toContain("line-clamp");
    expect(toggle.textContent).toBe("Show less");
  });

  it("should show the fact, then the question, the answer and the example", () => {
    renderCard();

    const order = [
      screen.getByTestId("knowledge-bit-focus-fact"),
      screen.getByTestId("knowledge-bit-review-edit-prompt-v1"),
      screen.getByTestId("knowledge-bit-review-edit-answer-v1"),
      screen.getByTestId("knowledge-bit-review-edit-example-bit-1"),
    ];

    order.slice(1).forEach((element, index) => {
      expect(
        order[index]!.compareDocumentPosition(element) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    });
  });

  it("should put the example before the other variations", () => {
    renderCard();

    const example = screen.getByTestId(
      "knowledge-bit-review-edit-example-bit-1",
    );
    const variations = screen.getByTestId(
      "knowledge-bit-review-variations-bit-1",
    );

    expect(
      example.compareDocumentPosition(variations) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("should hide the example field when the card has no example and reveal it on request", () => {
    renderCard(makeBit({ background: null }));

    expect(
      screen.queryByTestId("knowledge-bit-review-edit-example-bit-1"),
    ).toBeNull();

    fireEvent.click(screen.getByTestId("knowledge-bit-focus-add-example"));

    expect(document.activeElement).toBe(
      screen.getByTestId("knowledge-bit-review-edit-example-bit-1"),
    );
  });

  it("should scroll long card content while the decision buttons stay outside the scrolled area", () => {
    renderCard();

    const scroller = screen
      .getByTestId("knowledge-bit-review-edit-prompt-v1")
      .closest(".overflow-y-auto");

    expect(scroller).not.toBeNull();
    expect(
      scroller?.contains(screen.getByRole("button", { name: "Approve" })),
    ).toBe(false);
  });

  it("should disable both decisions while a decision is being saved", () => {
    renderCard(makeBit(), { isResolving: true });

    expect(
      (screen.getByRole("button", { name: "Reject" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(
      (screen.getByRole("button", { name: "Approve" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });

  it("should not allow approving a card that has no questions yet", () => {
    renderCard(makeBit({ variants: [] }));

    expect(
      (screen.getByRole("button", { name: "Approve" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(screen.getByText("Writing cards…")).toBeTruthy();
  });

  it("should block decisions while an edit is not saved yet and report editing", async () => {
    const onEditingChange = vi.fn();
    const onSaveVariant = vi.fn(async () => true);

    renderCard(makeBit(), { onEditingChange, onSaveVariant });
    fireEvent.change(
      screen.getByTestId("knowledge-bit-review-edit-prompt-v1"),
      {
        target: { value: "New front" },
      },
    );

    await waitFor(() => {
      expect(
        (screen.getByRole("button", { name: "Approve" }) as HTMLButtonElement)
          .disabled,
      ).toBe(true);
    });
    expect(onEditingChange).toHaveBeenCalledWith("bit-1", true);

    await waitFor(
      () => {
        expect(onSaveVariant).toHaveBeenCalledWith(
          "bit-1",
          "v1",
          "New front",
          "100 C",
          "",
        );
      },
      { timeout: 3000 },
    );
    await waitFor(() => {
      expect(
        (screen.getByRole("button", { name: "Approve" }) as HTMLButtonElement)
          .disabled,
      ).toBe(false);
    });
  });

  it("should list the fields as Context, Question, Answer, Examples with full words", () => {
    renderCard(
      makeBit({
        variants: [
          {
            id: "v1",
            kind: "basic",
            prompt: "Q?",
            answer: "A",
            context: "To a manager",
          },
        ],
      }),
    );

    const labels = screen
      .getAllByText(/^(Context|Question|Answer|Examples)$/)
      .map((node) => node.textContent);

    expect(labels).toEqual(["Context", "Question", "Answer", "Examples"]);
    expect(
      (screen.getByLabelText("Context") as HTMLTextAreaElement).value,
    ).toBe("To a manager");
  });

  it("should save an edited context together with the question and answer", async () => {
    const onSaveVariant = vi.fn(async () => true);

    renderCard(makeBit(), { onSaveVariant });
    fireEvent.change(
      screen.getByTestId("knowledge-bit-review-edit-context-v1"),
      {
        target: { value: " In a stand-up " },
      },
    );

    await waitFor(
      () => {
        expect(onSaveVariant).toHaveBeenCalledWith(
          "bit-1",
          "v1",
          "At what temperature does water boil?",
          "100 C",
          "In a stand-up",
        );
      },
      { timeout: 3000 },
    );
  });

  it("should show the example field and the error message", () => {
    renderCard(makeBit(), { errorMessage: "Could not approve" });

    expect(
      (screen.getByLabelText(/Example/) as HTMLTextAreaElement).value,
    ).toBe("Kettle example");
    expect(screen.getByRole("alert").textContent).toBe("Could not approve");
  });

  it("should hide the source section when there is no source text", () => {
    renderCard(makeBit(), { sourceText: null });

    expect(screen.queryByTestId("knowledge-bit-focus-source")).toBeNull();
  });
});

describe("KnowledgeBitFocusCard sentence options", () => {
  const choiceBit = makeBit({
    answerChoice: true,
    variants: [
      {
        id: "s1",
        prompt: "You want to reconnect.",
        answer: "Let us touch base on Friday.",
      },
      {
        id: "s2",
        prompt: "You want to reconnect.",
        answer: "I will touch base with her.",
      },
      {
        id: "s3",
        prompt: "You want to reconnect.",
        answer: "Touch base soon, please.",
      },
    ],
  } as Partial<PendingKnowledgeBitForReview>);

  const variedBit = makeBit({
    answerChoice: true,
    variants: [
      {
        id: "f1",
        prompt: "Formal moment.",
        answer: "Let us touch base on Friday.",
      },
      {
        id: "f2",
        prompt: "Neutral moment.",
        answer: "I will touch base with her.",
      },
      {
        id: "f3",
        prompt: "Casual moment.",
        answer: "Touch base soon, please.",
      },
    ],
  } as Partial<PendingKnowledgeBitForReview>);

  it("should show the front of the selected option, not the first one", () => {
    renderCard(variedBit, { selectedIndex: 2 });

    expect(
      screen.getByTestId("knowledge-bit-focus-options-front").textContent,
    ).toBe("Casual moment.");
    expect(screen.queryByText("Formal moment.")).toBeNull();
    expect(screen.getAllByRole("radio")[2]?.textContent).toBe(
      "Touch base soon, please.",
    );
  });

  it("should show the question once and the sentences as one single-select list with the highlighted one checked", () => {
    renderCard(choiceBit, { selectedIndex: 1 });

    expect(screen.getAllByText("You want to reconnect.")).toHaveLength(1);
    expect(screen.getByRole("radiogroup")).toBeTruthy();

    const radios = screen.getAllByRole("radio");

    expect(radios.map((radio) => radio.getAttribute("aria-checked"))).toEqual([
      "false",
      "true",
      "false",
    ]);
  });

  it("should let a tap choose a sentence", () => {
    const onSelect = vi.fn();

    renderCard(choiceBit, { onSelect });
    fireEvent.click(screen.getByTestId("knowledge-bit-focus-option-s3"));

    expect(onSelect).toHaveBeenCalledWith(2);
  });

  it("should not choose a sentence when the tap ends a text selection inside it", () => {
    const onSelect = vi.fn();

    renderCard(choiceBit, { onSelect });

    const option = screen.getByTestId("knowledge-bit-focus-option-s3");
    const range = document.createRange();

    range.selectNodeContents(option);
    window.getSelection()?.removeAllRanges();
    window.getSelection()?.addRange(range);
    fireEvent.click(option);
    window.getSelection()?.removeAllRanges();

    expect(onSelect).not.toHaveBeenCalled();
  });

  it("should keep card text selectable and show no copy-all button", () => {
    renderCard(choiceBit);

    const card = screen.getByTestId("knowledge-bit-focus-card-bit-1");

    expect(card.querySelector('[class*="select-none"]')).toBeNull();
    expect(card.querySelector('[class*="pointer-events-none"]')).toBeNull();
    expect(
      screen.queryByTestId("knowledge-bit-focus-copy-all-bit-1"),
    ).toBeNull();
    expect(
      screen.getByTestId("knowledge-bit-focus-option-s3").className,
    ).toContain("select-text");
  });

  it("should keep the plain editable card for a bit that is not a choice", () => {
    renderCard();

    expect(screen.queryByRole("radiogroup")).toBeNull();
    expect(
      screen.getByTestId("knowledge-bit-review-edit-prompt-v1"),
    ).toBeTruthy();
  });

  it("should show larger question and answer text in Triage", () => {
    renderCard();

    expect(
      screen.getByTestId("knowledge-bit-review-edit-prompt-v1").className,
    ).toContain("text-2xl");
    expect(
      screen.getByTestId("knowledge-bit-review-edit-answer-v1").className,
    ).toContain("text-lg");
  });
});

describe("KnowledgeBitFocusShell", () => {
  function renderShell(
    props: Partial<React.ComponentProps<typeof KnowledgeBitFocusShell>> = {},
  ) {
    const handlers = { onUndo: vi.fn(), onFinish: vi.fn() };

    render(
      <KnowledgeBitFocusShell
        readyCount={4}
        waitingCount={0}
        canUndo={true}
        {...handlers}
        {...props}
      >
        <p>inside</p>
      </KnowledgeBitFocusShell>,
    );

    return handlers;
  }

  it("should present itself as a modal dialog around the card", () => {
    renderShell();

    const dialog = screen.getByRole("dialog");

    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(dialog.textContent).toContain("inside");
  });

  it("should show how many cards are left and how many are still being written", () => {
    renderShell({ readyCount: 3, waitingCount: 2 });

    expect(
      screen.getByTestId("knowledge-bit-focus-progress").textContent,
    ).toContain("3 to review");
    expect(screen.getByTestId("knowledge-bit-focus-position").textContent).toBe(
      "1 of 5",
    );
    expect(screen.getByTestId("knowledge-bit-focus-waiting").textContent).toBe(
      "Writing cards… 2 waiting",
    );
  });

  it("should count the card position across cards already decided in the session", () => {
    renderShell({ readyCount: 9, waitingCount: 1, decidedCount: 2 });

    expect(screen.getByTestId("knowledge-bit-focus-position").textContent).toBe(
      "3 of 12",
    );
  });

  it("should count the position against the server pending total when more cards are waiting than were loaded", () => {
    renderShell({ readyCount: 200, waitingCount: 0, decidedCount: 3, pendingCount: 350 });

    expect(screen.getByTestId("knowledge-bit-focus-position").textContent).toBe(
      "4 of 353",
    );
  });

  it("should label the exit button Leave and open the shortcuts help from the question mark button", () => {
    renderShell();

    expect(screen.getByTestId("knowledge-bit-focus-finish").textContent).toBe(
      "Leave",
    );

    fireEvent.click(screen.getByTestId("knowledge-bit-focus-help"));

    expect(
      screen.getByTestId("knowledge-bit-focus-shortcuts-dialog"),
    ).toBeTruthy();
  });

  it("should call Undo and Leave, and disable Undo when there is nothing to undo", () => {
    const handlers = renderShell();

    fireEvent.click(screen.getByTestId("knowledge-bit-focus-undo"));
    fireEvent.click(screen.getByTestId("knowledge-bit-focus-finish"));

    expect(handlers.onUndo).toHaveBeenCalledTimes(1);
    expect(handlers.onFinish).toHaveBeenCalledTimes(1);

    cleanup();
    renderShell({ canUndo: false });

    expect(
      (screen.getByTestId("knowledge-bit-focus-undo") as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });

  it("should show the Needs manual review banner with a plain reason on a flagged card and keep it approvable", () => {
    const handlers = renderCard(makeBit({ reviewFlag: "quote_not_in_source" }));

    expect(
      screen.getByTestId("knowledge-bit-review-flag-bit-1").textContent,
    ).toContain("Needs manual review");
    expect(
      screen.getByTestId("knowledge-bit-review-flag-bit-1").textContent,
    ).toContain("The supporting quote could not be matched to your note");

    fireEvent.click(screen.getByTestId("knowledge-bit-focus-approve-bit-1"));

    expect(handlers.onApprove).toHaveBeenCalledWith("bit-1");
  });

  it("should show no banner on a clean card", () => {
    renderCard();

    expect(screen.queryByTestId("knowledge-bit-review-flag-bit-1")).toBeNull();
  });
});
