import { z } from "zod";
import type { EvalCard } from "./analyse-cards.ts";

export const CRITERIA = ["would_learn_something", "can_apply", "answerable_alone", "single_clear_idea", "faithful_to_source", "not_trivial"] as const;
export type Criterion = (typeof CRITERIA)[number];

const scoreSchema = z.object({ score: z.number().int().min(1).max(5), reason: z.string() });

export const cardJudgeSchema = z.object({
  would_learn_something: scoreSchema,
  can_apply: scoreSchema,
  answerable_alone: scoreSchema,
  single_clear_idea: scoreSchema,
  faithful_to_source: scoreSchema,
  not_trivial: scoreSchema,
  overall: scoreSchema,
  keep: z.object({ answer: z.enum(["yes", "no"]), reason: z.string() }),
});

export type CardJudgement = z.infer<typeof cardJudgeSchema>;

export const LABELS = ["A", "B", "C", "D", "E"] as const;

export const rankingSchema = z.object({
  ranking: z.array(z.enum(LABELS)).min(4).max(5),
  unacceptable: z.array(z.enum(LABELS)),
  reason: z.string(),
});

export type RankingJudgement = z.infer<typeof rankingSchema>;

const PERSONA = "You are a working professional who is learning business and will review these cards as spaced-repetition flashcards. Judge as that learner, not as an editor.";

const ANCHORS = `Scoring scale for every criterion: integers 1 to 5.
- would_learn_something: 1 = nothing new, you already knew this or it is only a story detail; 3 = a mildly useful reminder; 5 = a usable business idea you likely did not have.
- can_apply: 1 = after recalling the answer nothing at work would change; 3 = you could loosely apply it; 5 = you could act or decide differently at work right away.
- answerable_alone: 1 = the front is meaningless without the source ("according to the text, what did he say?"); 3 = understandable but needs some guessing about what is meant; 5 = a clear, self-contained question months later with no source open.
- single_clear_idea: 1 = mixes several ideas or asks for a list; 3 = one main idea plus a side idea; 5 = exactly one clear idea is tested.
- faithful_to_source: 1 = states things the source does not say or contradicts it; 3 = mostly supported with some added interpretation; 5 = everything on the card is supported by the source (nothing invented).
- not_trivial: 1 = restated truism or recall of the source's exact wording; 3 = fine but ordinary; 5 = not obvious and not a wording-recall question.
- overall: your holistic 1 to 5 judgement of the card as a flashcard for you.
- keep: would you keep this card in your deck? "yes" or "no".`;

function cardText(card: EvalCard): string {
  return [`type: ${card.type}`, `front: ${card.front}`, `back: ${card.back || "(empty)"}`, `context: ${card.context || "(empty)"}`, `example: ${card.example || "(empty)"}`].join("\n");
}

export function buildCardPrompt(sourceText: string, card: EvalCard): string {
  return `${PERSONA} Judge the single card below against the source it came from.

${ANCHORS}

Reply with JSON only, no code fence, in exactly this shape, with a one-sentence reason for each item:
{"would_learn_something":{"score":1,"reason":""},"can_apply":{"score":1,"reason":""},"answerable_alone":{"score":1,"reason":""},"single_clear_idea":{"score":1,"reason":""},"faithful_to_source":{"score":1,"reason":""},"not_trivial":{"score":1,"reason":""},"overall":{"score":1,"reason":""},"keep":{"answer":"yes","reason":""}}

SOURCE TEXT:
${sourceText}

CARD:
${cardText(card)}`;
}

export interface AnonymousSet {
  label: string;
  cards: EvalCard[];
  note: string;
}

export function buildRankingPrompt(sourceText: string, sets: readonly AnonymousSet[]): string {
  const blocks = sets.map((set) => {
    const body = set.cards.length === 0 ? `(no cards${set.note ? `; the writer's note: ${set.note}` : ""})` : set.cards.map((card, i) => `Card ${i + 1}\n${cardText(card)}`).join("\n\n");

    return `SET ${set.label}\n${body}`;
  });
  const labels = sets.map((set) => set.label);

  return `${PERSONA} ${sets.length} anonymous sets of flashcards (${labels.join(", ")}) were made from the same source text. Rank ALL sets from best to worst by this question: which set would you rather study from to learn this business idea? A set with no cards is ranked last unless the source has nothing applicable for a learner; then decide and say why. Name any set that is unacceptable (empty list if none).

Reply with JSON only, no code fence, in exactly this shape (ranking lists every set label once):
{"ranking":${JSON.stringify([...labels].reverse())},"unacceptable":[],"reason":"one or two sentences"}

SOURCE TEXT:
${sourceText}

${blocks.join("\n\n")}`;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;

  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;

    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);

    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashSeed(value: string): number {
  return [...value].reduce((h, ch) => Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0, 2166136261);
}

export function seededShuffle<T>(items: readonly T[], seed: string): T[] {
  const rand = mulberry32(hashSeed(seed));
  const out = [...items];

  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    const a = out[i] as T;

    out[i] = out[j] as T;
    out[j] = a;
  }

  return out;
}
