import type { Gap } from "@post-anki/shared";
import type { InlineKeyboard } from "../telegram/bot.js";
import { buildCallback } from "../nav/callback.js";
import { chunkButtons } from "../nav/keyboard.js";

// Reusable triage keyboard/callback module (issue #29) — generically scoped
// to the triage state machine itself, no gap-triage-specific business logic
// beyond what's needed to render the buttons and confirmation copy. #27 and
// #43 are both expected to call into this same module from their own
// trigger points once they land ("owned by #29 across all contexts").

const RESHOW_DISMISS_AFTER_DEFERRALS = 3;

export function buildTriageKeyboard(gapId: string, deferralCount: number): InlineKeyboard {
  const buttons = [
    { text: "Important", callback_data: buildCallback("triage_important", gapId) },
    { text: "Defer again", callback_data: buildCallback("triage_defer", gapId) },
    { text: "Dismiss", callback_data: buildCallback("triage_dismiss", gapId) },
  ];

  if (deferralCount >= RESHOW_DISMISS_AFTER_DEFERRALS) {
    buttons.push({
      text: "Actually dismiss?",
      callback_data: buildCallback("triage_dismiss_shortcut", gapId),
    });
  }

  return chunkButtons(buttons, 3);
}

export function buildResurfaceCheckinKeyboard(gapId: string): InlineKeyboard {
  return chunkButtons(
    [
      { text: "Yes, still got it", callback_data: buildCallback("checkin_confirm", gapId) },
      {
        text: "Actually, let's revisit",
        callback_data: buildCallback("checkin_revisit", gapId),
      },
    ],
    3,
  );
}

export function resurfaceMessageText(label: string, tool: string): string {
  return `Your deferred gap is back: ${label} (${tool})`;
}

export function dismissedCheckinMessageText(label: string, tool: string): string {
  return `A few months back you dismissed this: ${label} (${tool}). Still confident?`;
}

export function importantConfirmationText(label: string, tool: string): string {
  return `Noted — ${tool}: ${label} is flagged as important.`;
}

export const DEFER_CONFIRMATION_TEXT = "Got it — deferred for 60 days.";

export const DISMISS_CONFIRMATION_TEXT = "Dismissed. I'll trust your judgment on this one.";

export const CHECKIN_CONFIRM_TEXT = "Good to know — I won't bring this one up again.";

export const CHECKIN_REVISIT_TEXT = "Reopened — I'll ask about it again.";

// Issue #33's "Visual distinction in /gaps" section, verbatim. Same section,
// distinct label — "prevents the user from wondering why they 'chose' to
// defer something they never consciously acted on." Driven by the gap's
// STORED `triageState`, not `effectiveTriageState` — the bot depends only on
// @post-anki/shared, not @post-anki/core, and whichever section a future
// /gaps (#43) files a gap under is itself driven by the stored value, so a
// label from the same stored value is always internally consistent with its
// own heading. Not wired to any live surface in this story — #43 imports it.
export const AUTO_FILED_SUFFIX = "(auto-filed)";
export const USER_DEFERRED_SUFFIX = "(deferred by you)";

export function deferredGapListLabel(gap: Gap): string {
  if (gap.triageState === "auto_deferred") {
    return `${gap.label} ${AUTO_FILED_SUFFIX}`;
  }

  if (gap.triageState === "user_deferred") {
    return `${gap.label} ${USER_DEFERRED_SUFFIX}`;
  }

  return gap.label;
}
