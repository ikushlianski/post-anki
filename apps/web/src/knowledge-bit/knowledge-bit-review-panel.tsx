import { useCallback, useRef, useState } from "react";
import type { PendingKnowledgeSourceForReview } from "@post-anki/shared";

import { sendDecisionNote } from "./knowledge-bit-review-note";
import { singleSubjectId } from "./knowledge-bit-review-sources";
import { useBulkApproval } from "./knowledge-bit-review-bulk-approval";
import { useSourceRegeneration } from "./knowledge-bit-review-regeneration";
import { KnowledgeBitReviewLanding } from "./knowledge-bit-review-landing";
import { KnowledgeBitReviewAttentionBlock } from "./knowledge-bit-review-attention-block";
import {
  splitAttentionSources,
  useAttentionNotices,
} from "./use-attention-notices";
import { buildFocusQueue } from "./knowledge-bit-focus-queue";
import {
  useFocusKeyboard,
  type FocusKeyAction,
} from "./knowledge-bit-focus-keyboard";
import { KnowledgeBitReviewFocusView } from "./knowledge-bit-review-focus-view";
import {
  KnowledgeBitReviewAnnouncer,
  useReviewAnnouncer,
} from "./knowledge-bit-review-announcer";
import { useReviewQuestionRefresh } from "./use-review-question-refresh";
import { usePendingUndecidedCount } from "./pending-undecided-count";
import { useReviewDecisions } from "./use-review-decisions";
import { useReviewBitEdits } from "./use-review-bit-edits";
import { useTriageExtras } from "./use-triage-extras";
import { useResolvingSuggestions } from "../domain-map/use-resolving-suggestions";
import { TriageSessionSection } from "../card-triage/triage-session-section";
import { useCardDwell } from "../card-triage/use-card-dwell";
import { useTriageSession } from "../card-triage/use-triage-session";

export function KnowledgeBitReviewPanel({
  initialSources,
  pendingTotal,
}: {
  initialSources: PendingKnowledgeSourceForReview[];
  pendingTotal?: number;
}) {
  const [sources, setSources] = useState(
    () => splitAttentionSources(initialSources).cards,
  );
  const [note, setNote] = useState({ bitId: "", text: "" });
  const editingBitIds = useRef(new Set<string>());
  const knownBitIds = useRef(
    new Set(initialSources.flatMap((s) => s.bits.map((bit) => bit.id))),
  );
  const regeneration = useSourceRegeneration({
    sources,
    setSources,
    knownBitIds,
  });
  const attention = useAttentionNotices({
    initial: splitAttentionSources(initialSources).notices,
    clearRetryState: regeneration.actions.onCancel,
  });
  const { reloadAfterRetry } = attention;

  const {
    claim: claimBit,
    release: releaseBit,
    isResolving: isBitResolving,
  } = useResolvingSuggestions();
  const { saveVariant, saveNote, saveBit } = useReviewBitEdits(setSources);
  const {
    decisions,
    rowErrors,
    approve,
    keepVariants,
    reject,
    undo,
    markApproved,
  } = useReviewDecisions({
    knownBitIds,
    claimBit,
    releaseBit,
    onDecided: (bitId, decision) => {
      extras.pushDecision(bitId);
      triageSession.recordDecision(bitId, decision.verdict, {
        note: note.bitId === bitId ? note.text.trim() : "",
        dwellMs: takeDwell(bitId),
      });
    },
    onUndone: (bitId) => triageSession.recordUndo(bitId),
  });
  const { announcement, announce } = useReviewAnnouncer();
  const extras = useTriageExtras({
    decisions,
    undoDecision: undo,
    claimBit,
    releaseBit,
    setSources,
    announce,
  });
  const pendingSources = sources.map((source) => ({
    ...source,
    bits: source.bits.filter(
      (bit) => !decisions[bit.id] && !extras.inboxedIds.has(bit.id) && !extras.chattedIds.has(bit.id),
    ),
  }));
  const undecidedCount = usePendingUndecidedCount(
    initialSources,
    pendingTotal,
    pendingSources,
    decisions,
    extras,
  );
  const triageSession = useTriageSession({
    decisions,
    subjectId: singleSubjectId(pendingSources),
    undecidedCount,
  });
  const queue = buildFocusQueue(pendingSources);
  const allBits = pendingSources.flatMap((source) => source.bits);
  const readyBits = allBits.filter((bit) => bit.variants.length > 0);
  const undoError = Object.keys(rowErrors).find(
    (id) => rowErrors[id] && decisions[id],
  );
  const [doneFeedback, setDoneFeedback] = useState("");
  const [choice, setChoice] = useState({ bitId: "", index: 0 });
  const inFocus = triageSession.isOpen && triageSession.phase === "idle";
  const currentBit = queue.current?.bit;
  const hasOptions = Boolean(currentBit?.answerChoice && currentBit.variants.length > 1);
  const selectedIndex = choice.bitId === currentBit?.id ? choice.index : 0;
  const takeDwell = useCardDwell(inFocus ? queue.current?.bit.id : undefined);

  const pollingGaveUp = useReviewQuestionRefresh({
    pendingSources,
    regeneration,
    reloadAfterRetry,
    rowErrors,
    setSources,
    knownBitIds,
    editingBitIds,
  });

  const handleEditingChange = useCallback((bitId: string, editing: boolean) => {
    if (editing) {
      editingBitIds.current.add(bitId);
    } else {
      editingBitIds.current.delete(bitId);
    }
  }, []);

  const bulk = useBulkApproval({
    sources: pendingSources,
    readyBits,
    setSources,
    markApproved,
    knownBitIds,
    editingBitIds,
    claimBit,
    releaseBit,
  });

  async function decide(action: "approve" | "reject") {
    const bitId = queue.current?.bit.id;

    if (!bitId || editingBitIds.current.has(bitId) || isBitResolving(bitId)) {
      return;
    }

    const text = note.bitId === bitId ? note.text.trim() : "";
    const left = Math.max(queue.readyCount - 1, 0);
    const chosen = queue.current?.bit.answerChoice
      ? queue.current.bit.variants[selectedIndex]
      : undefined;
    const approveBit = () =>
      chosen ? keepVariants(bitId, [chosen.id]) : approve(bitId);
    const decision = await (action === "approve"
      ? approveBit()
      : reject(bitId));

    if (!decision) {
      return;
    }

    announce("polite", `${action === "approve" ? "Approved" : "Rejected"}, ${left} left`);

    if (text) {
      void sendDecisionNote(action, bitId, text, decision.feedbackId, () =>
        announce("assertive", "Couldn't save your note."),
      );
    }
  }

  function currentBitIfFree() {
    const bit = queue.current?.bit;

    return bit && !editingBitIds.current.has(bit.id) && !isBitResolving(bit.id)
      ? bit
      : undefined;
  }

  function withFreeBit(run: (bit: NonNullable<ReturnType<typeof currentBitIfFree>>, left: number) => void) {
    const bit = currentBitIfFree();

    if (bit) {
      run(bit, Math.max(queue.readyCount - 1, 0));
    }
  }

  const chatAboutCurrent = () => withFreeBit((bit, left) => void extras.sendToChat(bit.id, left));
  const inboxCurrent = () => withFreeBit((bit, left) => void extras.sendToInbox(bit.id, left));
  const exampleForCurrent = () => withFreeBit((bit) => void extras.generateExample(bit));

  function moveOption(step: number) {
    const last = (currentBit?.variants.length ?? 1) - 1;

    setChoice({
      bitId: currentBit?.id ?? "",
      index: Math.min(Math.max(selectedIndex + step, 0), last),
    });
  }

  function handleAction(action: FocusKeyAction) {
    if (action === "option-prev" || action === "option-next") {
      moveOption(action === "option-next" ? 1 : -1);
    } else if (action === "undo") {
      void extras.undoLast();
    } else if (action === "chat") {
      chatAboutCurrent();
    } else if (action === "inbox") {
      inboxCurrent();
    } else if (action === "example") {
      exampleForCurrent();
    } else {
      void decide(action);
    }
  }

  useFocusKeyboard(handleAction, inFocus, hasOptions);

  const session = (
    <TriageSessionSection session={triageSession} canStart={readyBits.length > 0} hideOpenBar />
  );

  if (triageSession.isOpen) {
    return (
      <KnowledgeBitReviewFocusView
        queue={queue}
        triageSession={triageSession}
        pendingCount={undecidedCount}
        extras={extras}
        inFocus={inFocus}
        session={session}
        announcement={announcement}
        isBitResolving={isBitResolving}
        pollingGaveUp={pollingGaveUp}
        rowErrors={rowErrors}
        undoError={undoError}
        note={note}
        setNote={setNote}
        selectedIndex={selectedIndex}
        setChoice={setChoice}
        doneFeedback={doneFeedback}
        setDoneFeedback={setDoneFeedback}
        handlers={{
          onChat: chatAboutCurrent,
          onInbox: inboxCurrent,
          onExample: exampleForCurrent,
          onApprove: () => void decide("approve"),
          onReject: () => void decide("reject"),
          onEditingChange: handleEditingChange,
          onSaveVariant: saveVariant,
          onSaveBit: saveBit,
          onSaveNote: saveNote,
        }}
      />
    );
  }

  return (
    <div data-testid="knowledge-bit-review-panel">
      <KnowledgeBitReviewLanding
        sources={pendingSources}
        readyCount={queue.readyCount}
        waitingCount={queue.waitingCount}
        showWaiting={!pollingGaveUp}
        regenerationStates={regeneration.states}
        regenerationActions={regeneration.actions}
        bulk={bulk}
        hasNotices={attention.notices.length > 0}
        notices={<KnowledgeBitReviewAttentionBlock notices={attention.notices} states={regeneration.states} actions={regeneration.actions} onDiscard={attention.discard} />}
      >
        {session}
      </KnowledgeBitReviewLanding>
      <KnowledgeBitReviewAnnouncer announcement={announcement} />
    </div>
  );
}
