import type { InlineKeyboard } from "../telegram/bot.js";
import { buildCallback } from "../nav/callback.js";
import { chunkButtons } from "../nav/keyboard.js";

// Soft checkpoint keyboard (issue #27, spec.md Decision 2). "Continue now"
// reuses the existing "continue" callback / onContinue path verbatim — no
// new callback kind, no new endpoint.
export function buildCheckpointKeyboard(isIntensityMode = false): InlineKeyboard {
  const buttons = [{ text: "📚 Continue now", callback_data: buildCallback("continue") }];

  if (isIntensityMode) {
    // #25's extension point. "done" is not a real CallbackKind yet
    // (nav/callback.ts has no such member/prefix) — #25 owns adding that
    // kind together with its own "Save for next session" handler and the
    // real source of isIntensityMode. "noop" keeps this branch
    // typecheck-clean and independently testable without this story wiring
    // a callback it doesn't own.
    buttons.push({ text: "⏭ Save for next session", callback_data: buildCallback("noop") });
  }

  return chunkButtons(buttons, 2);
}
