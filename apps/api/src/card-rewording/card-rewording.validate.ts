import { BASIC_CARD_FRONT_MAX_CHARS } from "../knowledge-bit/knowledge-bit-basic-card-validation.js";
import { CARD_REWORDING_MAX_VERSIONS, type CardRewordingOutput } from "./card-rewording.prompt.js";

export type RewordedVersion = CardRewordingOutput["versions"][number];

const ANSWER_LEAK_MIN_CHARS = 4;

function normalize(text: string): string {
  return text.trim().replace(/\s+/g, " ").toLowerCase();
}

export function validateRewordedVersions(
  original: { front: string; back: string },
  versions: readonly RewordedVersion[],
): RewordedVersion[] {
  const originalFront = normalize(original.front);
  const answer = normalize(original.back);
  const seen = new Set<string>();
  const kept: RewordedVersion[] = [];

  for (const version of versions) {
    const prompt = version.prompt.trim();
    const normalized = normalize(prompt);

    if (normalized.length === 0 || prompt.length > BASIC_CARD_FRONT_MAX_CHARS) {
      continue;
    }

    if (normalized === originalFront || seen.has(normalized)) {
      continue;
    }

    if (answer.length >= ANSWER_LEAK_MIN_CHARS && normalized.includes(answer)) {
      continue;
    }

    seen.add(normalized);
    kept.push({ angle: version.angle, prompt });

    if (kept.length === CARD_REWORDING_MAX_VERSIONS) {
      break;
    }
  }

  return kept;
}
