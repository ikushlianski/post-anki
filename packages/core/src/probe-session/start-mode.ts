import type { TopicProgress } from "@post-anki/shared";

export type ProbeStartMode = "quiz" | "socratic";

export function deriveStartMode(progress: TopicProgress): ProbeStartMode {
  if (progress.status === "not_started") {
    return "quiz";
  }

  return "socratic";
}
