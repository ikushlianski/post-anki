# List-aware card writing

## Behaviour
- A note that holds a list (a "works when" list, "risks" 1..4, a set of categories) never becomes a card whose answer is the whole list.
- Card types for list material, in priority order:
  - **Situation → category:** a situation restated in new words, and the answer names one category. Example: «Вас вынуждают участвовать в переговорах, к которым вы не готовы. Какой стиль?» → Уклонение. Each situation points to exactly one category; if a neighbour category could fit, the answer says why this one.
  - **One item per card:** for a closed list, one item is hidden and the others may be shown as context, in the source's order. An ordered process may get chain cards (item → next item).
  - **One reason or risk per card, with a cue:** «Чем уклонение опасно для навыков переговорщика в долгую?», never "list all risks".
  - **Discrimination between sibling categories** when the material names several, e.g. уклонение vs подстройка.
  - **Open (growing) lists:** example → category cards only, never an enumeration.
  - **Fill-in-the-blank on one word only for terms.**
- Out of scope:
  - a later whole-list card;
  - mnemonic acronyms as answers;
  - Anki cloze markup in notes (owned by `anki-cloze-import`).
- Subject levels (Easy/Normal/Cram) are untouched, because they only change retention. The detail level, learner goal and subject notes keep feeding the prompt as today.
- Sources:
  - SuperMemo 20 rules, rules 9–10: super-memory.com/articles/20rules.htm
  - Matuschak, closed and open lists: andymatuschak.org/prompts/

## Why notes fail today (facts from code)
- **Business subjects (Marketing, Sales, Finance…)** go to a one-call business card writer, `apps/api/src/mastra/knowledge-bit-business-cards.prompt.ts`. Its active prompt is V7.
  - It writes "one card per kept idea", with at most `BUSINESS_CARDS_MAX_PER_CHUNK` = `LESSONS_MAX_PER_CHUNK` = 3 per 3000-character chunk.
  - So a list chapter collapses to 3 cards or less, or into an `ordered_list` card whose answer is the whole list.
  - The prompt has no list-splitting rules.
- **Business basic cards store `statement = back`** (`toSourceItem` in `apps/api/src/mastra/knowledge-bit-business-cards.agent.ts`).
  - Several situation cards that share the answer «Уклонение» get the same statement.
  - `selectNewItems` dedupes by statement (`apps/api/src/knowledge-bit/knowledge-bit-source-item-validation.ts`), so all but one are silently dropped.
- **Other subjects** use lessons, then cards (`apps/api/src/mastra/knowledge-bit-source-items.agent.ts`). Its `LISTS AND CATEGORIES` block already forbids whole-list backs, but its rule 1 (mnemonic frame) asks for a card whose answer is the full list. That contradicts the user's ask.
- **Validator:** situation and paraphrased cards pass. The quote must be verbatim (`isQuoteInSource`, normalised for case, spacing, quote marks and ё). `answer_on_front` only fires when the whole back sits in the front. The prompt must tell the model to quote one list item, not a span across list numbering.

## Architecture
- **One shared rule block, `LIST_CARD_RULES`,** in `apps/api/src/mastra/knowledge-bit-prompt-rules.ts`, used by both card writers.
  - The business prompt V8 is built from V7 like V4–V7 (string replace), and `ACTIVE_BUSINESS_CARDS_PROMPT` moves to V8.
  - The generic `INSTRUCTIONS` swaps its list block for the shared one.
- **Business card cap for list notes:** `BUSINESS_CARDS_MAX_PER_CHUNK` rises from 3 to 8 (`LIST_CARDS_MAX_PER_LESSON`).
  - The prompt keeps "at most 3 ideas", and a list idea may produce up to 8 cards.
  - The per-source cap (`MAX_ITEMS_PER_SOURCE`) is unchanged.
- **Statement uniqueness:** a business basic card whose back has fewer than 6 words stores `statement = "<front> — <back>"`.
  - Situation cards then stay distinct, and the duplicate gate (question + answer) is unaffected.
- **`ordered_list` cards** stay for real step-by-step processes only. V8 says a list of reasons, conditions or risks is not an `ordered_list`.
- No schema, migration, API or app changes.

## Files
- `apps/api/src/mastra/knowledge-bit-prompt-rules.ts`: add `LIST_CARD_RULES`.
- `apps/api/src/mastra/knowledge-bit-business-cards.prompt.ts`: add V8 (list rules, a list idea gives several cards, quote one item), and make it active.
- `apps/api/src/mastra/knowledge-bit-business-cards.agent.ts`: raise the cap; short-back statement rule. **Shared with anki-cloze-import, which touches `toSourceItem` and cloze parsing there, so this builds after it.**
- `apps/api/src/mastra/knowledge-bit-source-items.agent.ts`: replace the list block with the shared rules, and drop the whole-list mnemonic card.
- `apps/api/src/knowledge-bit/ingestion-pipeline.md`: one bullet on list cards.

## Tests (vitest, co-located, mocked model)
- `knowledge-bit-business-cards.agent.test.ts`:
  - "should use the list-aware prompt as the active business prompt and keep v7 for comparison"
  - "should tell the writer never to put a whole list on one card's back and to quote a single list item"
  - "should keep every situation card that shares a one-word answer such as a style name"
  - "should keep up to eight cards from one list-shaped chunk"
- `knowledge-bit-source-items.agent.test.ts` (or the nearest existing prompt test): "should not ask for a card whose answer is the whole list".
- An integration test in the existing knowledge-bit integration pattern, with a mocked model returning 6 situation and risk cards for the avoidance text: "should store each situation and risk card from a list chapter as its own card".
- Optional paid eval (needs user OK; costs OpenRouter money): run `apps/api/scripts/eval-business-cards-prompt.ts` with the avoidance text as a source.

## Manual test
1. Import the avoidance text (the user's negotiation example) into a business subject with triage on.
2. Expect 5–8 cards:
   - Several «ситуация → какой стиль?» cards answered «Уклонение».
   - Single-risk cards (passive aggression, escalation, time pressure, lost practice → vicious circle).
   - No card whose back lists 3 or more items, and no near-copy of a source sentence as the question.
3. Import a short ordered process (3–5 steps): it still yields one `ordered_list` card.

## Risks
- **More cards per note:** imports pace by unseen cards (cap 100), so big list chapters will fill the backlog faster.
- **A situation might fit two styles:** the prompt asks for a "why this, not that" answer, and triage catches the rest.
- **Model drift:** prompt wording alone cannot guarantee single-category situations. The tests pin the prompt text and the pipeline behaviour, not model quality.
