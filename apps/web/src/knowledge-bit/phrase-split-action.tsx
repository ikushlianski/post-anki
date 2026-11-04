import { useCallback, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { KnowledgeBitInboxToast } from "./knowledge-bit-inbox-toast";
import { splitPhraseKnowledgeBit } from "./phrase-split.api";
import { KNOWLEDGE_BROWSER_QUERY_KEY } from "./use-knowledge-browser-data";

function resultText(updated: number | undefined): string {
  if (updated === undefined) {
    return "Card split";
  }

  if (updated === 0) {
    return "Nothing to split. The situations are already separate.";
  }

  return `Split into ${updated} ${updated === 1 ? "card" : "cards"}`;
}

const ERROR_TEXT: Record<string, string> = {
  not_found: "This card no longer exists.",
};

const DEFAULT_ERROR_TEXT = "Could not split this card. Try again.";

function errorText(code: string): string {
  return ERROR_TEXT[code] ?? DEFAULT_ERROR_TEXT;
}

export function PhraseSplitAction({
  bitId,
  isPhrase,
}: {
  bitId: string;
  isPhrase: boolean;
}) {
  const queryClient = useQueryClient();
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const dismissToast = useCallback(() => setToastMessage(null), []);
  const mutation = useMutation({
    mutationFn: async () => {
      const outcome = await splitPhraseKnowledgeBit({ data: { id: bitId } });

      if (!outcome.ok) {
        throw new Error(outcome.error);
      }

      return outcome;
    },
    onSuccess: (outcome) => {
      setToastMessage(
        resultText(
          typeof outcome.updated === "number" ? outcome.updated : undefined,
        ),
      );

      return queryClient.invalidateQueries({
        queryKey: KNOWLEDGE_BROWSER_QUERY_KEY,
      });
    },
    onError: (error) => setToastMessage(errorText(error.message)),
  });

  if (!isPhrase) {
    return null;
  }

  return (
    <div data-testid="phrase-split-action" className="mb-5">
      <button
        type="button"
        data-testid="phrase-split-button"
        disabled={mutation.isPending}
        className="rounded border border-neutral-300 px-3 py-1 text-sm text-neutral-900 disabled:opacity-60"
        onClick={() => mutation.mutate()}
      >
        {mutation.isPending ? "Splitting…" : "Split into situations"}
      </button>
      {toastMessage !== null ? (
        <KnowledgeBitInboxToast
          bitId={bitId}
          message={toastMessage}
          onDismiss={dismissToast}
        />
      ) : null}
    </div>
  );
}
