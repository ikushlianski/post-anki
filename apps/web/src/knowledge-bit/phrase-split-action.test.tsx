// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const api = vi.hoisted(() => ({ split: vi.fn() }));

vi.mock("./phrase-split.api", () => ({ splitPhraseKnowledgeBit: api.split }));

import { PhraseSplitAction } from "./phrase-split-action";

function renderAction(isPhrase: boolean, client = new QueryClient()) {
  render(
    <QueryClientProvider client={client}>
      <PhraseSplitAction bitId="b1" isPhrase={isPhrase} />
    </QueryClientProvider>,
  );

  return client;
}

describe("PhraseSplitAction", () => {
  beforeEach(() => {
    api.split.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it("should not offer the split on a card that is not a phrase card", () => {
    renderAction(false);

    expect(screen.queryByTestId("phrase-split-button")).toBeNull();
  });

  it("should offer the split on a phrase card", () => {
    renderAction(true);

    expect(
      screen.getByRole("button", { name: "Split into situations" }),
    ).toBeTruthy();
  });

  it("should split that one card, show how many cards were made in the toast, and refresh the panel data", async () => {
    let finish: (value: unknown) => void = () => undefined;

    api.split.mockReturnValue(new Promise((resolve) => (finish = resolve)));

    const client = renderAction(true);
    const invalidate = vi.spyOn(client, "invalidateQueries");

    fireEvent.click(screen.getByTestId("phrase-split-button"));

    await waitFor(() =>
      expect(
        (screen.getByTestId("phrase-split-button") as HTMLButtonElement)
          .disabled,
      ).toBe(true),
    );
    finish({ ok: true, updated: 2, variants: [] });
    await waitFor(() =>
      expect(screen.getByTestId("knowledge-bit-inbox-toast").textContent).toBe(
        "Split into 2 cards",
      ),
    );
    expect(api.split).toHaveBeenCalledWith({ data: { id: "b1" } });
    expect(invalidate).toHaveBeenCalled();
  });

  it("should fall back to a plain confirmation when the response has no count", async () => {
    api.split.mockResolvedValue({ ok: true, variants: [] });

    renderAction(true);
    fireEvent.click(screen.getByTestId("phrase-split-button"));

    await waitFor(() =>
      expect(screen.getByTestId("knowledge-bit-inbox-toast").textContent).toBe(
        "Card split",
      ),
    );
  });

  it("should say nothing changed when the card was already split", async () => {
    api.split.mockResolvedValue({ ok: true, updated: 0, variants: [] });

    renderAction(true);
    fireEvent.click(screen.getByTestId("phrase-split-button"));

    await waitFor(() =>
      expect(
        screen.getByTestId("knowledge-bit-inbox-toast").textContent,
      ).toMatch(/Nothing to split/),
    );
  });

  it("should tell the user in plain words that the card no longer exists and let them retry", async () => {
    api.split.mockResolvedValue({ ok: false, error: "not_found" });

    renderAction(true);
    fireEvent.click(screen.getByTestId("phrase-split-button"));

    await waitFor(() =>
      expect(screen.getByTestId("knowledge-bit-inbox-toast").textContent).toBe(
        "This card no longer exists.",
      ),
    );
    expect(
      (screen.getByTestId("phrase-split-button") as HTMLButtonElement).disabled,
    ).toBe(false);
  });

  it("should show a generic retry message for an unknown error code", async () => {
    api.split.mockResolvedValue({ ok: false, error: "boom_123" });

    renderAction(true);
    fireEvent.click(screen.getByTestId("phrase-split-button"));

    await waitFor(() =>
      expect(screen.getByTestId("knowledge-bit-inbox-toast").textContent).toBe(
        "Could not split this card. Try again.",
      ),
    );
  });

  it("should show the generic retry message when the request itself fails", async () => {
    api.split.mockRejectedValue(new Error("fetch failed"));

    renderAction(true);
    fireEvent.click(screen.getByTestId("phrase-split-button"));

    await waitFor(() =>
      expect(screen.getByTestId("knowledge-bit-inbox-toast").textContent).toBe(
        "Could not split this card. Try again.",
      ),
    );
  });
});
