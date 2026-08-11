import { QUESTIONS_PER_TOPIC } from "@post-anki/core";

export interface SliceGenerationPromptInput {
  alreadyCoveredTitles: string[];
  topicCount: number;
  sourceText: string;
}

export function buildSliceGenerationPrompt(input: SliceGenerationPromptInput): string {
  const coveredList =
    input.alreadyCoveredTitles.length > 0
      ? input.alreadyCoveredTitles.map((title) => `- ${title}`).join("\n")
      : "(none yet — this is the first slice)";

  return [
    `Propose at most ${input.topicCount} new topic(s), each with up to ${QUESTIONS_PER_TOPIC} gap(s).`,
    "",
    "Topics already covered for this item (never repeat these):",
    coveredList,
    "",
    "<untrusted-source-text>",
    input.sourceText,
    "</untrusted-source-text>",
  ].join("\n");
}
