import { useCallback, useRef, useState } from "react";
import {
  CHAT_QUEUE_MAX_MESSAGE_CHARS,
  CHAT_QUEUE_STARTER_PROMPTS,
  type ChatQueueKnowledgeBit,
} from "@post-anki/shared";

import { toSafeLink } from "../knowledge-bit/ai-label-badge";
import {
  PRIMARY_BUTTON_CLASS,
  SECONDARY_BUTTON_CLASS,
  TEXT_BUTTON_CLASS,
  TEXT_FIELD_CLASS,
} from "../knowledge-bit/knowledge-bit-review-classes";
import { ChatQueueDeleteLast } from "./chat-queue-delete-last";
import { ChatQueueCopyButton } from "./chat-queue-copy-button";
import { clearChatDraft } from "./chat-queue-draft-storage";
import { ChatQueueRejectReasons } from "./chat-queue-reject-reasons";
import { ChatQueueSnooze } from "./chat-queue-snooze";
import { ChatQueueTurnsMeter } from "./chat-queue-turns-meter";
import { ChatQueueProposals } from "./chat-queue-proposals";
import { useChatProposals, type RejectedProposal } from "./use-chat-proposals";
import { rejectedProposalMessage, rejectedProposalMessageId } from "./chat-queue-reject-message";
import { useChatThread } from "./use-chat-thread";
import { chatWaitingDays, formatChatWaiting } from "./chat-queue-waiting";

interface Props {
  item: ChatQueueKnowledgeBit;
  now?: Date;
  onBack: () => void;
  onResolved: (id: string) => void;
  onSnoozeChanged: (id: string, snoozedUntil: string | null) => void;
}

export function ChatQueueThread({ item, now, onBack, onResolved, onSnoozeChanged }: Props) {
  const handleResolved = useCallback(
    (id: string) => {
      clearChatDraft(id);
      onResolved(id);
    },
    [onResolved],
  );
  const handleSnoozeChanged = useCallback(
    (id: string, snoozedUntil: string | null) => {
      if (snoozedUntil) {
        clearChatDraft(id);
      }

      onSnoozeChanged(id, snoozedUntil);
    },
    [onSnoozeChanged],
  );
  const thread = useChatThread(item, handleResolved);
  const locked = thread.resolving || thread.sending;
  const composer = useRef<HTMLTextAreaElement>(null);
  const lineCount = useRef(0);
  const [rejectedAt, setRejectedAt] = useState<number | null>(null);
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const { sendWithId } = thread;
  const handleProposalRejected = useCallback(
    async (rejected: RejectedProposal) => {
      const sent = await sendWithId(
        rejectedProposalMessage(rejected.front),
        rejectedProposalMessageId(item.id, rejected),
      );

      if (!sent) {
        setRejectedAt(lineCount.current);
        composer.current?.focus();
      }
    },
    [item.id, sendWithId],
  );
  const proposals = useChatProposals(item.id, {
    onDecided: thread.applyDecision,
    onRejected: handleProposalRejected,
  });
  const lastProposals = thread.lines[thread.lines.length - 1]?.proposals ?? []
  const lastLineId = thread.lines[thread.lines.length - 1]?.id ?? ''
  const proposalSaving = lastProposals.some(
    (proposal) => proposals.statusOf(lastLineId, proposal.index).state === 'saving',
  )
  const proposalAccepted = lastProposals.some((proposal) => proposal.status === 'accepted')
  const exchangeLocked = locked || proposalSaving || proposalAccepted
  const showRejectHint =
    rejectedAt === thread.lines.length && thread.draft.length === 0 && !thread.sending;
  lineCount.current = thread.lines.length;
  const sourceLink = item.sourceUrl ? toSafeLink(item.sourceUrl) : null;

  return (
    <section data-testid="chat-queue-thread" className="space-y-4">
      <button type="button" onClick={onBack} className={TEXT_BUTTON_CLASS}>
        All chats
      </button>

      <p data-testid="chat-queue-thread-waiting" className="text-xs text-neutral-500">
        {formatChatWaiting(chatWaitingDays(item.chatAt, now ?? new Date()))}
      </p>

      {item.sourceTitle ? (
        <p data-testid="chat-queue-thread-source" className="text-xs text-neutral-500">
          From{" "}
          {sourceLink ? (
            <a
              href={sourceLink.href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-700 underline"
            >
              {item.sourceTitle}
            </a>
          ) : (
            item.sourceTitle
          )}
        </p>
      ) : null}

      <ChatQueueTurnsMeter turnsLeft={thread.turnsLeft} />

      {item.reviewChat ? null : (
        <ChatQueueSnooze item={item} onChanged={handleSnoozeChanged} />
      )}

      <div className="rounded-lg border border-neutral-200 p-4">
        <p className="text-sm font-medium whitespace-pre-wrap">{item.body}</p>
        {item.background ? (
          <p className="mt-2 text-xs text-neutral-500 whitespace-pre-wrap">
            {item.background}
          </p>
        ) : null}
      </div>

      <ul className="space-y-3" data-testid="chat-queue-lines">
        {thread.lines.map((line, index) => {
          return (
            <li key={line.id}>
              <p className="text-xs text-neutral-500">
                {line.isUser ? "You" : "Tutor"}
              </p>
              <p className="text-sm whitespace-pre-wrap">{line.text}</p>
              {line.isUser ? null : (
                <ChatQueueCopyButton text={line.text} seq={line.id} />
              )}
              {!line.isUser && index === thread.lines.length - 1 && !thread.rejecting ? (
                <button
                  type="button"
                  data-testid="chat-queue-retry"
                  disabled={exchangeLocked || thread.removal.deleting || thread.budgetPaused}
                  onClick={() => void thread.retryLast()}
                  className={TEXT_BUTTON_CLASS}
                >
                  Retry
                </button>
              ) : null}
              {!line.isUser && line.proposals?.length ? (
                <ChatQueueProposals
                  lineId={line.id}
                  seq={line.seq}
                  proposals={line.proposals}
                  statusOf={proposals.statusOf}
                  onDecide={(lineId, lineSeq, proposal, decision) =>
                    void proposals.decide(lineId, lineSeq, proposal, decision)
                  }
                />
              ) : null}
            </li>
          );
        })}
      </ul>

      {thread.lines.length > 0 && !thread.rejecting ? (
        <ChatQueueDeleteLast removal={thread.removal} disabled={exchangeLocked} />
      ) : null}

      {thread.sending ? (
        <p role="status" className="text-sm text-neutral-500">
          Thinking…
        </p>
      ) : null}

      {thread.error ? (
        <p
          role="alert"
          data-testid="chat-queue-error"
          className="text-sm text-red-700"
        >
          {thread.error}
        </p>
      ) : null}

      {thread.rejecting ? (
        <ChatQueueRejectReasons
          reasonCodes={item.rejectReasonCodes}
          onSend={thread.sendRejectReason}
          onSkip={thread.skipRejectReason}
        />
      ) : (
        <>
          {thread.showsStarters ? (
            <div
              className="flex flex-wrap gap-2"
              data-testid="chat-queue-starters"
            >
              {CHAT_QUEUE_STARTER_PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  disabled={locked}
                  onClick={() => void thread.send(prompt)}
                  className={SECONDARY_BUTTON_CLASS}
                >
                  {prompt}
                </button>
              ))}
            </div>
          ) : null}

          {thread.limitReached ? (
            <p
              data-testid="chat-queue-limit"
              className="text-sm text-neutral-500"
            >
              Chat limit reached, decide now
            </p>
          ) : thread.budgetPaused ? (
            <p
              data-testid="chat-queue-paused"
              className="text-sm text-neutral-500"
            >
              Chat is paused for today
            </p>
          ) : (
            <form
              className="space-y-1"
              onSubmit={(event) => {
                event.preventDefault();
                void thread.send();
              }}
            >
              <div className="flex gap-2">
                <textarea
                  ref={composer}
                  aria-label="Ask about this card"
                  placeholder="Ask about this card"
                  rows={2}
                  maxLength={CHAT_QUEUE_MAX_MESSAGE_CHARS}
                  value={thread.draft}
                  onChange={(event) => thread.changeDraft(event.target.value)}
                  className={TEXT_FIELD_CLASS}
                />
                <button
                  type="submit"
                  data-testid="chat-queue-send"
                  disabled={!thread.canSend}
                  className={PRIMARY_BUTTON_CLASS}
                >
                  Send
                </button>
              </div>
              {showRejectHint ? (
                <p data-testid="chat-queue-reject-hint" className="text-xs text-neutral-500">
                  What is wrong with it?
                </p>
              ) : null}
            </form>
          )}

          {item.reviewChat ? (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                data-testid="chat-queue-clear"
                disabled={locked}
                onClick={() => void thread.clearChat()}
                className={SECONDARY_BUTTON_CLASS}
              >
                Clear chat
              </button>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {thread.hasAcceptedCard ? (
                <button
                  type="button"
                  data-testid="chat-queue-finish"
                  disabled={locked}
                  onClick={() => void thread.accept()}
                  className={PRIMARY_BUTTON_CLASS}
                >
                  Finish chat
                </button>
              ) : (
                <button
                  type="button"
                  data-testid="chat-queue-cancel"
                  disabled={locked}
                  onClick={() =>
                    thread.lines.length === 0 ? void thread.cancelChat() : setConfirmingCancel(true)
                  }
                  className={PRIMARY_BUTTON_CLASS}
                >
                  Cancel chat
                </button>
              )}
              {confirmingCancel ? (
                <div role="alertdialog" aria-label="Cancel this chat?" className="flex flex-wrap items-center gap-2 text-sm">
                  <span>Delete the conversation and send the item back to triage?</span>
                  <button
                    type="button"
                    data-testid="chat-queue-cancel-confirm"
                    disabled={locked}
                    onClick={() => void thread.cancelChat()}
                    className={SECONDARY_BUTTON_CLASS}
                  >
                    Delete chat
                  </button>
                  <button
                    type="button"
                    data-testid="chat-queue-cancel-keep"
                    onClick={() => setConfirmingCancel(false)}
                    className={SECONDARY_BUTTON_CLASS}
                  >
                    Keep chatting
                  </button>
                </div>
              ) : null}
              <button
                type="button"
                data-testid="chat-queue-reject"
                disabled={locked}
                onClick={() => void thread.reject()}
                className={SECONDARY_BUTTON_CLASS}
              >
                Reject
              </button>
              <button
                type="button"
                data-testid="chat-queue-back"
                disabled={locked}
                onClick={() => void thread.backToTriage()}
                className={SECONDARY_BUTTON_CLASS}
              >
                Back to triage
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
