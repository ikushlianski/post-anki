import type { Gap, TriageAction } from "@post-anki/shared";
import { editMessageText, sendMessageWithKeyboard } from "../telegram/bot.js";
import { markGapResurfaced, triageGap } from "../api/client.js";
import { log } from "../telegram/log.js";
import {
  buildResurfaceCheckinKeyboard,
  buildTriageKeyboard,
  CHECKIN_CONFIRM_TEXT,
  CHECKIN_REVISIT_TEXT,
  DEFER_CONFIRMATION_TEXT,
  DISMISS_CONFIRMATION_TEXT,
  dismissedCheckinMessageText,
  importantConfirmationText,
  resurfaceMessageText,
} from "./gap-triage-view.js";

// The reusable entry point #27/#43 are expected to call once they land
// ("owned by #29 across all contexts") — one standalone message per gap,
// never batched, matching every other pending gap's message independently.
export async function sendGapTriageMessage(
  chatId: number,
  gap: Gap,
  tool: string,
): Promise<void> {
  await sendMessageWithKeyboard(
    chatId,
    resurfaceMessageText(gap.label, tool),
    buildTriageKeyboard(gap.id, gap.deferralCount),
  );
}

export async function sendDismissedCheckinMessage(
  chatId: number,
  gap: Gap,
  tool: string,
): Promise<void> {
  await sendMessageWithKeyboard(
    chatId,
    dismissedCheckinMessageText(gap.label, tool),
    buildResurfaceCheckinKeyboard(gap.id),
  );
}

export type TriageCallbackKind =
  | "triage_important"
  | "triage_defer"
  | "triage_dismiss"
  | "triage_dismiss_shortcut";

const ACTION_BY_TRIAGE_KIND: Record<TriageCallbackKind, TriageAction> = {
  triage_important: "important",
  triage_defer: "defer",
  triage_dismiss: "dismiss",
  // A UI shortcut, not a distinct transition — routes to the identical
  // handler/action as the plain Dismiss button.
  triage_dismiss_shortcut: "dismiss",
};

// Only edits the message (removing the keyboard) when the transition
// actually changed something — a `changed: false` no-op (e.g. a duplicate
// webhook delivery racing a genuine tap) leaves the message exactly as-is,
// no second Telegram call.
export async function handleTriageCallback(
  chatId: number,
  messageId: number,
  gapId: string,
  kind: TriageCallbackKind,
): Promise<void> {
  const action = ACTION_BY_TRIAGE_KIND[kind];
  const result = await triageGap(gapId, action);

  if (!result.changed) {
    return;
  }

  const text =
    action === "important"
      ? importantConfirmationText(result.gap.label, result.tool)
      : action === "defer"
        ? DEFER_CONFIRMATION_TEXT
        : DISMISS_CONFIRMATION_TEXT;

  await editMessageText(chatId, messageId, text);
}

export type CheckinCallbackKind = "checkin_confirm" | "checkin_revisit";

// `checkin_confirm` ("Yes, still got it") performs no state write — the gap
// was already `dismissed`, this only acknowledges it. `checkin_revisit`
// ("Actually, let's revisit") goes through the same locked triage path as
// every other transition, via the `revisit` action.
export async function handleCheckinCallback(
  chatId: number,
  messageId: number,
  gapId: string,
  kind: CheckinCallbackKind,
): Promise<void> {
  if (kind === "checkin_confirm") {
    await editMessageText(chatId, messageId, CHECKIN_CONFIRM_TEXT);
    return;
  }

  await triageGap(gapId, "revisit");
  await editMessageText(chatId, messageId, CHECKIN_REVISIT_TEXT);
}

// The bot's POST /gap-resurface handler (server.ts): read the due
// candidates, send one message per gap, and only mark a gap resurfaced
// AFTER its own send has resolved successfully — an undelivered gap stays
// as-is and is naturally retried on the next day's run.
export interface ResurfaceCandidates {
  userDeferredDue: { gap: Gap; tool: string }[];
  dismissedCheckinDue: { gap: Gap; tool: string }[];
}

export async function runGapResurface(
  chatId: number,
  candidates: ResurfaceCandidates,
): Promise<void> {
  for (const { gap, tool } of candidates.userDeferredDue) {
    // Each gap is attempted independently — one gap's send failure never
    // blocks the rest of today's run, and never marks the failed gap
    // resurfaced (it stays `user_deferred`, naturally retried tomorrow).
    try {
      await sendGapTriageMessage(chatId, gap, tool);
      await markGapResurfaced(gap.id, "deferral-expired");
    } catch (err) {
      log.error({ err, gap_id: gap.id }, "gap_resurface_send_failed");
    }
  }

  for (const { gap, tool } of candidates.dismissedCheckinDue) {
    try {
      await sendDismissedCheckinMessage(chatId, gap, tool);
      await markGapResurfaced(gap.id, "dismissed-checkin");
    } catch (err) {
      log.error({ err, gap_id: gap.id }, "gap_dismissed_checkin_send_failed");
    }
  }
}
