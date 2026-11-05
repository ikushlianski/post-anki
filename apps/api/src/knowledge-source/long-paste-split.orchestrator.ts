import { countRecentLlmCallEventsByOp } from "../llm-call-events/llm-call-events.repo.js";
import {
  LONG_PASTE_SPLIT_OPERATION,
  runLongPasteSplitter,
} from "../mastra/long-paste-splitter.agent.js";
import { log } from "../shared/log.js";
import { assertLlmBudgetAvailable } from "../shared/spend-guard.js";
import {
  SPLIT_HOURLY_CAP,
  SPLIT_MIN_CHARS,
  SPLIT_WINDOW_MS,
  isLongPasteSplitEnabled,
} from "./long-paste-split.config.js";
import { sliceAtAnchors, type SplitPart } from "./long-paste-split.js";

let inFlight = 0;

export async function splitLongPaste(text: string): Promise<SplitPart[] | null> {
  if (!isLongPasteSplitEnabled() || text.length < SPLIT_MIN_CHARS) return null;

  let reserved = false;

  try {
    const used = await countRecentLlmCallEventsByOp(LONG_PASTE_SPLIT_OPERATION, SPLIT_WINDOW_MS);

    if (used + inFlight >= SPLIT_HOURLY_CAP) {
      log.warn({ used }, "long_paste_split_rate_limited");

      return null;
    }

    inFlight += 1;
    reserved = true;
    await assertLlmBudgetAvailable();

    const plan = await runLongPasteSplitter(text);
    const parts = sliceAtAnchors(text, plan.sections);

    if (parts === null) {
      log.warn("long_paste_split_anchors_unusable");
    }

    return parts;
  } catch (err) {
    log.warn({ err }, "long_paste_split_failed");

    return null;
  } finally {
    if (reserved) inFlight -= 1;
  }
}
