import { useCallback, useEffect, useMemo, useState } from "react";

import { ChatQueueThread } from "./chat-queue-thread";
import { ChatQueueShortcutsHelp } from "./chat-queue-shortcuts-help";
import { ChatQueueRowList } from "./chat-queue-row-list";
import { ChatQueueStatus } from "./chat-queue-status";
import { ChatQueueOldestWait } from "./chat-queue-oldest-wait";
import { ChatQueueSummary } from "./chat-queue-summary";
import { isSnoozed } from "./is-snoozed";
import { ChatQueueNoMatches } from "./chat-queue-no-matches";
import { ChatQueueFilterBar } from "./chat-queue-filter-bar";
import { ChatQueueMessageSearch } from "./chat-queue-message-search";
import {
  EMPTY_CHAT_QUEUE_FILTER,
  chatQueueSubjectId,
  chatQueueSubjects,
  filterChatQueue,
  type ChatQueueFilter,
} from "./chat-queue-filter";
import {
  loadChatQueueOrder,
  saveChatQueueOrder,
} from "./chat-queue-order-storage";
import { clampFocusIndex, moveFocusIndex } from "./chat-queue-focus";
import { ChatQueueBulkBar } from "./chat-queue-bulk-bar";
import { useChatQueueBulk } from "./use-chat-queue-bulk";
import { useChatQueueKeys } from "./use-chat-queue-keys";
import { useChatQueueQuickSnooze } from "./use-chat-queue-quick-snooze";
import { ListTruncatedNotice } from "../knowledge-bit/list-truncated-notice";
import { useChatQueue } from "./use-chat-queue";
import { useChatQueueExport } from "./use-chat-queue-export";
import {
  staleChatIds,
  sortChatQueue,
  type ChatQueueSortOrder,
} from "./chat-queue-waiting";

export function ChatQueueScreen({
  now,
  initialCardId,
}: { now?: Date; initialCardId?: string } = {}) {
  const { state, truncation, load, resolved, resolvedMany, snoozedChanged } =
    useChatQueue();
  const chatExport = useChatQueueExport();
  const [selectedId, setSelectedId] = useState<string | null>(
    initialCardId ?? null,
  );

  const [filter, setFilter] = useState<ChatQueueFilter>(
    EMPTY_CHAT_QUEUE_FILTER,
  );
  const allItems = state.status === "ready" ? state.items : [];
  const subjects = useMemo(() => chatQueueSubjects(allItems), [allItems]);
  const exportSubjectId = chatQueueSubjectId(allItems, filter.subject);
  const [order, setOrder] = useState<ChatQueueSortOrder>(loadChatQueueOrder);
  const visible = useMemo(
    () => sortChatQueue(filterChatQueue(allItems, filter), order),
    [allItems, filter, order],
  );

  const selected =
    state.status === "ready"
      ? (state.items.find((item) => item.id === selectedId) ?? null)
      : null;

  const [helpOpen, setHelpOpen] = useState(false);
  const [focusIndex, setFocusIndex] = useState(-1);
  const focusedIndex = clampFocusIndex(focusIndex, visible.length);
  const focusedId = visible[focusedIndex]?.id ?? null;

  const bulk = useChatQueueBulk(resolvedMany);
  const { prune, drop } = bulk;
  const quickSnooze = useChatQueueQuickSnooze(
    useCallback(
      (id: string, snoozedUntil: string) => {
        snoozedChanged(id, snoozedUntil);
        drop(id);
      },
      [snoozedChanged, drop],
    ),
  );
  useEffect(() => {
    if (state.status === "ready") prune(state.items.map((item) => item.id));
  }, [state, prune]);

  const pickedVisible = visible
    .filter((item) => bulk.picked.has(item.id))
    .map((item) => item.id);
  const staleIds = staleChatIds(visible, now ?? new Date());
  const allShownPicked =
    visible.length > 0 && pickedVisible.length === visible.length;

  useChatQueueKeys({
    onInbox: () => {
      quickSnooze.clearError();

      if (focusedId && !bulk.moving) void bulk.moveSingle(focusedId);
    },
    onSnooze: () => {
      const target = visible[focusedIndex];

      if (target && !isSnoozed(target, now ?? new Date()) && !bulk.moving)
        void quickSnooze.snooze(target.id);
    },
    onToggle: () => {
      quickSnooze.clearError();

      if (focusedId) bulk.toggle(focusedId);
    },
    enabled: !selected && visible.length > 0 && !helpOpen,
    onMove: (delta) => {
      quickSnooze.clearError();
      setFocusIndex(moveFocusIndex(focusedIndex, delta, visible.length));
    },
    onOpen: () => {
      quickSnooze.clearError();

      if (focusedId) setSelectedId(focusedId);
    },
  });

  useEffect(() => {
    if (focusedId) {
      document
        .querySelector<HTMLElement>(
          `[data-testid="chat-queue-row-${focusedId}"]`,
        )
        ?.scrollIntoView?.({ block: "nearest" });
    }
  }, [focusedId]);

  return (
    <main
      data-testid="chat-queue"
      className="mx-auto max-w-3xl px-4 py-6 sm:px-8 sm:py-10"
    >
      <ChatQueueShortcutsHelp open={helpOpen} onOpenChange={setHelpOpen} />

      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Chat</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Cards you parked while triaging. Ask the tutor about them, then
          accept, reject, or send them back to triage.
        </p>
        <ChatQueueSummary items={allItems} now={now ?? new Date()} />
        <ChatQueueOldestWait items={allItems} now={now ?? new Date()} />
      </header>

      <ChatQueueStatus state={state} onRetry={() => void load()} />

      <ListTruncatedNotice truncation={truncation} testId="chat-queue-truncated" />

      {quickSnooze.error ? (
        <p
          role="alert"
          data-testid="chat-queue-snooze-error"
          className="mb-3 text-sm text-red-700"
        >
          {quickSnooze.error}
        </p>
      ) : null}

      {selected ? (
        <ChatQueueThread
          key={selected.id}
          item={selected}
          now={now}
          onBack={() => setSelectedId(null)}
          onSnoozeChanged={(id, snoozedUntil) => {
            snoozedChanged(id, snoozedUntil);

            if (snoozedUntil) {
              setSelectedId(null);
            }
          }}
          onResolved={(id) => {
            setSelectedId(null);
            resolved(id);
          }}
        />
      ) : null}

      {state.status === "ready" && state.items.length > 0 && !selected ? (
        <ChatQueueFilterBar
          filter={filter}
          subjects={subjects}
          shown={visible.length}
          total={state.items.length}
          staleCount={staleIds.length}
          selecting={bulk.moving}
          onSelectStale={() => bulk.pickAll(staleIds)}
          exportSubjectId={exportSubjectId}
          exporting={chatExport.exporting}
          exportError={chatExport.error}
          onExport={(id) => void chatExport.exportSubject(id)}
          onChange={setFilter}
        />
      ) : null}

      {state.status === "ready" && state.items.length > 0 && !selected ? (
        <ChatQueueMessageSearch items={state.items} onOpen={setSelectedId} />
      ) : null}

      {state.status === "ready" &&
      state.items.length > 0 &&
      !selected &&
      visible.length === 0 ? (
        <ChatQueueNoMatches
          onClear={() => setFilter(EMPTY_CHAT_QUEUE_FILTER)}
        />
      ) : null}

      {state.status === "ready" && visible.length > 0 && !selected ? (
        <>
          <div className="mb-2 flex items-center justify-between gap-2">
            <p
              data-testid="chat-queue-shortcuts-hint"
              className="text-xs text-neutral-500"
            >
              j/k to move, Enter to open
            </p>
            <button
              type="button"
              data-testid="chat-queue-order"
              onClick={() => {
                const next = order === "oldest" ? "newest" : "oldest";
                setOrder(next);
                saveChatQueueOrder(next);
              }}
              className="text-xs text-neutral-600 underline"
            >
              {order === "oldest" ? "Oldest first" : "Newest first"}
            </button>
          </div>
          <label className="mb-2 flex items-center gap-2 text-xs text-neutral-600">
            <input
              type="checkbox"
              data-testid="chat-queue-select-all"
              checked={allShownPicked}
              disabled={bulk.moving}
              onChange={() =>
                allShownPicked
                  ? bulk.clear()
                  : bulk.pickAll(visible.map((item) => item.id))
              }
            />
            Select all shown
          </label>
          {pickedVisible.length > 0 || bulk.failedCount > 0 ? (
            <ChatQueueBulkBar
              count={pickedVisible.length}
              moving={bulk.moving}
              failedCount={bulk.failedCount}
              onMove={() => void bulk.move(pickedVisible)}
              onClear={bulk.clear}
            />
          ) : null}
          <ChatQueueRowList
            items={visible}
            focusedId={focusedId}
            picked={bulk.picked}
            moving={bulk.moving}
            now={now}
            onToggle={bulk.toggle}
            onOpen={setSelectedId}
            onSnoozeChanged={snoozedChanged}
          />
        </>
      ) : null}
    </main>
  );
}
