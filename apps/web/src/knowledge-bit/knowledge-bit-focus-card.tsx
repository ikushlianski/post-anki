import { useCallback, useEffect, useRef, useState } from "react";
import type { PendingKnowledgeBitForReview } from "@post-anki/shared";

import { AiSuggestionBlock } from "./ai-suggestion-block";
import { TEXT_FIELD_CLASS } from "./knowledge-bit-review-classes";
import { KnowledgeBitModelBadges } from "./knowledge-bit-model-badges";
import { KnowledgeBitReviewFlagBanner } from "./knowledge-bit-review-flag-banner";
import { KnowledgeBitDuplicateBlock } from "./knowledge-bit-duplicate-block";
import { KnowledgeBitFocusExample } from "./knowledge-bit-focus-example";
import { useVerticalDrag } from "./knowledge-bit-focus-drag";
import {
  KnowledgeBitFocusDecisionButtons,
  type FocusPressedAction,
} from "./knowledge-bit-focus-decision-buttons";
import { KnowledgeBitFocusExtraActions } from "./knowledge-bit-focus-extra-actions";
import type { NoteMode } from "./knowledge-bit-review-note-edit";
import { KnowledgeBitFocusSourceBlock } from "./knowledge-bit-focus-source-block";
import { KnowledgeBitFocusVariants } from "./knowledge-bit-focus-variants";

interface KnowledgeBitFocusCardProps {
  bit: PendingKnowledgeBitForReview;
  subjectName: string | null;
  sourceText: string | null;
  isResolving: boolean;
  pollingGaveUp?: boolean;
  errorMessage?: string | null;
  note?: string;
  onNoteChange?: (note: string) => void;
  selectedIndex?: number;
  onSelect?: (index: number) => void;
  onApprove: (bitId: string) => void;
  onReject: (bitId: string) => void;
  onChat?: (bitId: string) => void;
  onInbox?: (bitId: string) => void;
  onExample?: (bitId: string) => void;
  example?: { error: string | null; left: number | null; version: number };
  onEditingChange?: (bitId: string, editing: boolean) => void;
  onSaveVariant: (
    bitId: string,
    variantId: string,
    prompt: string,
    answer: string,
    context?: string | null,
  ) => Promise<boolean>;
  onSaveBit: (
    bitId: string,
    body: string,
    background: string | null,
  ) => Promise<boolean>;
  onSaveNote?: (
    bitId: string,
    variantId: string,
    mode: NoteMode,
    text: string,
  ) => Promise<boolean>;
}

function FocusCardBody({
  bit,
  subjectName,
  sourceText,
  isResolving,
  pollingGaveUp = false,
  errorMessage = null,
  note = "",
  onNoteChange,
  selectedIndex = 0,
  onSelect,
  onApprove,
  onReject,
  onChat,
  onInbox,
  onExample,
  example = { error: null, left: null, version: 0 },
  onEditingChange,
  onSaveVariant,
  onSaveBit,
  onSaveNote,
}: KnowledgeBitFocusCardProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [pressed, setPressed] = useState<FocusPressedAction | null>(null);
  const [addingExample, setAddingExample] = useState(false);
  const [focusExample, setFocusExample] = useState(false);
  const [busyKeys, setBusyKeys] = useState<ReadonlySet<string>>(new Set());

  const setBusy = useCallback((key: string, busy: boolean) => {
    setBusyKeys((prev) => {
      if (prev.has(key) === busy) {
        return prev;
      }

      const next = new Set(prev);

      if (busy) {
        next.add(key);
      } else {
        next.delete(key);
      }

      return next;
    });
  }, []);

  const hasUnsavedEdits = busyKeys.size > 0;
  const hasNoVariants = bit.variants.length === 0;
  const showExample = addingExample || Boolean(bit.background?.trim());
  const actionsDisabled = isResolving || hasUnsavedEdits;
  const approveDisabled = actionsDisabled || hasNoVariants;
  const limitReached = example.left === 0;
  const exampleNotice = limitReached
    ? "5 AI examples used for this item"
    : example.error;
  const drag = useVerticalDrag({
    enabled: !actionsDisabled,
    onDrag: (direction) =>
      direction === "down" ? onChat?.(bit.id) : requestExample(),
  });

  const exampleSlot = hasNoVariants ? null : showExample ? (
    <KnowledgeBitFocusExample
      bit={bit}
      version={example.version}
      onSaveBit={onSaveBit}
      onBusyChange={(busy) => setBusy("example", busy)}
    />
  ) : (
    <button
      type="button"
      data-testid="knowledge-bit-focus-add-example"
      onClick={() => {
        setAddingExample(true);
        setFocusExample(true);
      }}
      className="min-h-11 text-xs font-medium text-neutral-500 hover:text-neutral-900 sm:min-h-8"
    >
      Add example
    </button>
  );

  function requestExample() {
    setPressed("example");
    onExample?.(bit.id);
  }

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  useEffect(() => {
    if (example.version > 0) {
      headingRef.current?.focus();
    }
  }, [example.version]);

  useEffect(() => {
    if (focusExample) {
      document
        .querySelector<HTMLTextAreaElement>(
          `[data-testid="knowledge-bit-review-edit-example-${bit.id}"]`,
        )
        ?.focus();
      setFocusExample(false);
    }
  }, [focusExample, bit.id]);

  useEffect(() => {
    onEditingChange?.(bit.id, hasUnsavedEdits);

    return () => onEditingChange?.(bit.id, false);
  }, [bit.id, hasUnsavedEdits, onEditingChange]);

  return (
    <article
      data-testid={`knowledge-bit-focus-card-${bit.id}`}
      className="mx-auto flex h-full min-h-0 w-full max-w-2xl flex-col"
    >
      <div
        data-testid="knowledge-bit-focus-scroll"
        {...drag}
        className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4"
      >
        <p
          data-testid="knowledge-bit-focus-subject"
          className="text-xs font-medium uppercase tracking-wide text-neutral-500"
        >
          {subjectName ?? "No subject"}
        </p>

        <KnowledgeBitModelBadges bitId={bit.id} modelIds={bit.modelIds} />

        <KnowledgeBitReviewFlagBanner
          bitId={bit.id}
          reviewFlag={bit.reviewFlag}
          aiSuggestion={bit.aiSuggestion}
        />

        {bit.duplicateOf ? (
          <KnowledgeBitDuplicateBlock
            bitId={bit.id}
            duplicateOf={bit.duplicateOf}
            busy={isResolving || hasUnsavedEdits}
            acceptDisabled={hasNoVariants}
            errorMessage={errorMessage}
            onReject={onReject}
            onAccept={onApprove}
          />
        ) : null}

        <KnowledgeBitFocusSourceBlock
          bit={bit}
          subjectName={subjectName}
          sourceText={sourceText}
          headingRef={headingRef}
        />

        <AiSuggestionBlock
          original={bit.body}
          aiSuggestion={bit.aiSuggestion}
          testIdSuffix={`-${bit.id}`}
        />

        <KnowledgeBitFocusVariants
          bit={bit}
          pollingGaveUp={pollingGaveUp}
          selectedIndex={selectedIndex}
          onSelect={onSelect}
          exampleSlot={exampleSlot}
          onSaveVariant={onSaveVariant}
          onSaveNote={onSaveNote}
          onBusyChange={setBusy}
        />

        {onNoteChange ? (
          <label className="block space-y-1 text-sm text-neutral-700">
            <span className="text-xs font-medium text-neutral-600">
              Note (optional)
            </span>
            <textarea
              data-testid="knowledge-bit-focus-note"
              value={note}
              maxLength={500}
              rows={2}
              placeholder="Why approve or reject? Helps future cards."
              onChange={(event) => onNoteChange(event.target.value)}
              className={TEXT_FIELD_CLASS}
            />
          </label>
        ) : null}

        {exampleNotice ? (
          <p
            role="alert"
            data-testid={`knowledge-bit-focus-example-notice-${bit.id}`}
            className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700"
          >
            {exampleNotice}
          </p>
        ) : null}

        {errorMessage ? (
          <p
            role="alert"
            data-testid={`knowledge-bit-review-error-${bit.id}`}
            className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700"
          >
            {errorMessage}
          </p>
        ) : null}
      </div>

      <div className="shrink-0 space-y-2 border-t border-neutral-200 bg-white px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3">
        {onChat && onExample ? (
          <KnowledgeBitFocusExtraActions
            bitId={bit.id}
            chatDisabled={actionsDisabled}
            exampleDisabled={actionsDisabled || limitReached}
            exampleWorking={isResolving && pressed === "example"}
            hasAiExample={Boolean(bit.exampleAiGeneratedAt)}
            onChat={() => onChat(bit.id)}
            onInbox={onInbox ? () => onInbox(bit.id) : undefined}
            onExample={requestExample}
          />
        ) : null}
        <KnowledgeBitFocusDecisionButtons
          bitId={bit.id}
          isResolving={isResolving}
          pressed={pressed}
          rejectDisabled={actionsDisabled}
          approveDisabled={approveDisabled}
          onPress={setPressed}
          onApprove={onApprove}
          onReject={onReject}
        />
      </div>
    </article>
  );
}

export function KnowledgeBitFocusCard(props: KnowledgeBitFocusCardProps) {
  return <FocusCardBody key={props.bit.id} {...props} />;
}
