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
Fewer is better. Keep at most {max_cards} ideas. Put every dropped idea, with a
five-word reason, in "dropped_ideas".

## Pass 2: write the cards (one card per kept idea)
- One card = one idea; the back is one short statement (max 25 words).
- The card must train USE, not recall of wording. Pick the question that makes
  the learner decide something: when to use it, when NOT to use it, how it
  differs from a similar idea, what signal shows it is needed, why it works,
  what comes next in the process.
- The front stands alone months later: no "this chapter", "the text", "the
  author says". Name the idea or the situation instead.
- Claims that are the author's opinion are phrased as the author's view.
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

export const ACTIVE_BUSINESS_CARDS_PROMPT = BUSINESS_CARDS_PROMPT_V3_SELF_FILTER;
