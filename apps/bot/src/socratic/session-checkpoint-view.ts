import type { InlineKeyboard } from "../telegram/bot.js";
import { buildCallback } from "../nav/callback.js";
import { chunkButtons } from "../nav/keyboard.js";

// Soft checkpoint keyboard (issue #27, spec.md Decision 2). "Continue now"
// reuses the existing "continue" callback / onContinue path verbatim — no
// new callback kind, no new endpoint.
export function buildCheckpointKeyboard(isIntensityMode = false): InlineKeyboard {
  const buttons = [{ text: "📚 Continue now", callback_data: buildCallback("continue") }];

  if (isIntensityMode) {
    // #25's extension point, now wired: "save_for_next" is a real
    // CallbackKind (nav/callback.ts) whose handler (nav/dispatcher.ts)
    // reuses endSocratic verbatim, same as /done. The button itself stays
    // unreachable in production — this function's only caller
    // (socratic-flow.ts's answerSocratic) always passes false, because
    // intensity mode (the only thing that would ever pass true) is
    // explicitly out of scope for #25. Disclosed in spec.md/todo.md, not a
    // bug to work around.
    buttons.push({ text: "⏭ Save for next session", callback_data: buildCallback("save_for_next") });
  }

  return chunkButtons(buttons, 2);
}
