import { CODE_CARD_RULES, LIST_CARD_RULES, PARAGRAPH_SOURCE_RULE } from "./knowledge-bit-prompt-rules.js";

// Change ACTIVE_BUSINESS_CARDS_PROMPT to swap the business card prompt version.

export const BUSINESS_CARDS_PROMPT_V3_SELF_FILTER = `You are an expert in spaced-repetition learning and in business literature
(management, marketing, sales, strategy, hiring). Turn the SOURCE TEXT into
flashcards in TWO passes inside one answer.

## Pass 1: choose the ideas (before any card)
Read the whole text. List every distinct idea a practitioner might need later,
then keep only the ones that pass ALL of these tests:
- It is a principle, rule, mechanism, decision criterion, step order or
  distinction that can be applied again, not an anecdote, a motivational line,
  a date, a name or a one-off story.
- The text states it clearly enough to be understood without outside knowledge.
- It is not a repeat of another kept idea in different words.
Fewer is better. A short note that states one such claim in a sentence or two
still holds one idea: write one card for it and do not return an empty list.
Never invent content to fill a card. Keep at most {max_cards} ideas. Put every dropped idea, with a
five-word reason, in "dropped_ideas".

## Pass 2: write the cards (one card per kept idea)
- One card = one idea; the back is one short statement (max 25 words) that
  directly answers the front in compact wording, never a copy of the source
  sentence or paragraph.
- The front is ONE clear question in one clause (max 20 words) with a concrete
  answer. It is never a yes/no question and the back never starts with yes/no.
- The card must train USE, not recall of wording. Pick the question that makes
  the learner decide something: when to use it, when NOT to use it, how it
  differs from a similar idea, what signal shows it is needed, why it works,
  what comes next in the process.
- The front stands alone months later: no "this chapter", "the text", "the
  author says". Name the idea or the situation instead.
- Opinions and advice are phrased as a general rule or condition ("When ...,
  ..."), without naming the author, the text or the source.
- Use a "cloze" card only for an ordered list or a definition where one key
  term is hidden in a single sentence; otherwise use "basic".
- Never add facts, numbers or examples that are not in the text.
- source_quote: a passage of 4 to 25 words copied character for character from
  the SOURCE TEXT that supports the card. If you cannot copy one exactly, do
  not write the card.

## Self-check before answering
For each card confirm: the front is answerable alone; the back is under 26
words; the quote is verbatim; the card is not a near-duplicate of another.
Remove any card that fails.

## Output
Return ONLY valid JSON, no commentary:
{
  "dropped_ideas": [{"idea": "...", "reason": "..."}],
  "cards": [
    {
      "type": "basic" | "cloze",
      "front": "...",
      "back": "...",
      "context": "1-2 sentences placing the idea in the bigger picture",
      "example": "from the text, else empty string",
      "tags": ["topic", "framework-name"],
      "source_quote": "..."
    }
  ]
}

Card language: {output_language}
Book / author / chapter: {metadata}
Max cards: {max_cards}

SOURCE TEXT:
{text}`;

const CLOZE_RULE_V4 = `- Use a "cloze" card only when ONE sentence of the text holds 2 to 5 key terms
  that can each be tested on their own (a definition with parts, a rule with
  conditions). Write the whole sentence in "front", wrapping each key term as
  {{c1::term}}, {{c2::term}} and so on, with an optional hint {{c1::term::hint}}.
  Give each term its own number, never nest markers, keep each term under 120
  characters, copy the sentence wording from the text, and leave "back" empty.
  With only one key term use "basic" with a question. Otherwise use "basic".
`;

export const BUSINESS_CARDS_PROMPT_V4_MULTI_CLOZE = BUSINESS_CARDS_PROMPT_V3_SELF_FILTER.replace(
  `- Use a "cloze" card only for an ordered list or a definition where one key
  term is hidden in a single sentence; otherwise use "basic".
`,
  CLOZE_RULE_V4,
);

const ORDERED_LIST_RULE_V5 = `- Use an "ordered_list" card only when the text itself states a process or
  checklist of 3 to 8 steps in a fixed order. Put the list title in "front"
  and the steps in "steps", in the order the text gives them, each step under
  120 characters and copied or tightly condensed from the text. Never invent,
  merge or reorder steps, leave "back" empty and keep "steps" empty for every
  other card type.
`;

export const BUSINESS_CARDS_PROMPT_V5_ORDERED_LIST = BUSINESS_CARDS_PROMPT_V4_MULTI_CLOZE.replace(
  `- Never add facts, numbers or examples that are not in the text.
`,
  `${ORDERED_LIST_RULE_V5}- Never add facts, numbers or examples that are not in the text.
`,
)
  .replace('"type": "basic" | "cloze",', '"type": "basic" | "cloze" | "ordered_list",')
  .replace('      "tags": ["topic", "framework-name"],\n', '      "tags": ["topic", "framework-name"],\n      "steps": [],\n');

const EMPTY_RULE_V6 = `Fewer is better. A short note that states one such claim in a sentence or two
still holds one idea: write one card for it and never return an empty list for
a note that contains a claim, rule, mechanism, criterion or distinction.
Return an empty "cards" list only when the text has nothing of practical value
to apply: greetings, filler, small talk, pure narrative with no takeaway, or
text with no claim at all. In that case explain in "dropped_ideas" in a few words.
Never invent content to fill a card.`;

export const BUSINESS_CARDS_PROMPT_V6_MAY_BE_EMPTY = BUSINESS_CARDS_PROMPT_V5_ORDERED_LIST.replace(
  `Fewer is better. A short note that states one such claim in a sentence or two
still holds one idea: write one card for it and do not return an empty list.
Never invent content to fill a card.`,
  EMPTY_RULE_V6,
);

const CLOZE_RULE_V7 = `- Default to a "basic" card with a direct what, why or how question. Use a
  "cloze" card only when ONE short sentence (at most 200 characters) of the text
  holds 2 to 5 key terms that can each be tested on their own. Wrap each term as
  {{c1::term}}, {{c2::term}} and so on, with an optional hint {{c1::term::hint}}.
  Give each term its own number, never nest markers, keep each term under 120
  characters, copy the sentence wording from the text, and leave "back" empty.
  Never use "cloze" for a long or multi-sentence passage; otherwise use "basic".
`;

export const BUSINESS_CARDS_PROMPT_V7_DIRECT_QUESTIONS = BUSINESS_CARDS_PROMPT_V6_MAY_BE_EMPTY.replace(
  CLOZE_RULE_V4,
  CLOZE_RULE_V7,
);

function replaceOnce(source: string, search: string, replacement: string): string {
  if (!source.includes(search)) {
    throw new Error(`business_prompt_anchor_missing: ${search.slice(0, 40)}`);
  }

  return source.replace(search, () => replacement);
}

const V8_EDITS: ReadonlyArray<readonly [string, string]> = [
  ["Keep at most {max_cards} ideas.", `${PARAGRAPH_SOURCE_RULE} Write at most {max_cards} cards in total; a list idea may use several of them.`],
  ["  other card type.\n", '  other card type. A list of reasons, conditions, risks or categories is never an "ordered_list".\n'],
  [
    "  not write the card.\n",
    "  not write the card. For a list card quote ONE item or sentence, never a span across list numbering.\n",
  ],
  ["## Self-check before answering", `${LIST_CARD_RULES}\n\n## Self-check before answering`],
  ["(max 20 words) with a concrete", "(max 20 words; a situation card up to 35) with a concrete"],
];

export const BUSINESS_CARDS_PROMPT_V8_LIST_AWARE = V8_EDITS.reduce(
  (prompt, [search, replacement]) => replaceOnce(prompt, search, replacement),
  BUSINESS_CARDS_PROMPT_V7_DIRECT_QUESTIONS,
);

const V9_EDITS: ReadonlyArray<readonly [string, string]> = [
  ["## Self-check before answering", `${CODE_CARD_RULES}\n\n## Self-check before answering`],
];

export const BUSINESS_CARDS_PROMPT_V9_CODE_AWARE = V9_EDITS.reduce(
  (prompt, [search, replacement]) => replaceOnce(prompt, search, replacement),
  BUSINESS_CARDS_PROMPT_V8_LIST_AWARE,
);

export const ACTIVE_BUSINESS_CARDS_PROMPT = BUSINESS_CARDS_PROMPT_V9_CODE_AWARE;
