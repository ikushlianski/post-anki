# Plan: cloze card type, then ordered-list card style

Build order: A (cloze) fully, then B (ordered list) on the same machinery. Plan only, no code written.
Sources read: `apps/api/src/db/schema.ts` (knowledge_bits, knowledge_bit_question_variants, knowledge_bit_schedules, knowledge_bit_reviews), `apps/api/src/mastra/knowledge-bit-business-cards.{prompt,agent}.ts`, `knowledge-bit-source-items.agent.ts`, `knowledge-bit-fill-blank-generator.agent.ts`, `apps/api/src/knowledge-bit/*` (queue, edit, source-items insert, kind rules), `packages/shared/src/knowledge-bit{,-review}.ts`, `apps/web/src/knowledge-bit/anki-review-card*.tsx`, `docs/architecture/knowledge-bit/{anki-review,variant-generation}.md`, iOS review models, `.planning/TODO.md` (card-prompts-by-subject-kind).

## Business summary

- Today a "cloze" card from the AI can only hide ONE word; a note with several hideable facts is dropped or reduced to one blank. After this, one note like "A deal needs {{c1::budget}}, {{c2::authority}} and {{c3::need}}" becomes three separate cards (one per number), each hiding its own gap while showing the others filled in, each scheduled and graded on its own.
- Lists of steps (a process, a checklist) become a set of cards: "what is step 3", "after step 2 the next step is ____", and one overview card "how many steps, name them". Learners are tested on order and completeness instead of one vague blob.
- The AI card writer offers these shapes only for subjects where they fit (business and other subjects; language subjects keep the original sentence-level behaviour untouched). The learner can edit a cloze note or a list in review; edits keep the progress of cards that still exist.
- Web ships first; iOS shows the new cards correctly in a follow-on slice but the API protects older iOS builds meanwhile.

## Facts found (cited)

- Fact: a variant row = one reviewable card: kind, order, prompt, answer, sentence (nullable), supersededAt (schema.ts:1247-1276). Kind is plain text; the closed set lives in the shared Zod enum (`packages/shared/src/knowledge-bit.ts:25-29`).
- Fact: unique active slot is (bit, kind, order) among non-superseded rows, so `order` can carry the cloze number or step index with no new column.
- Fact: scheduling is ONE row per bit (`knowledgeBitSchedules.knowledgeBitId` is the primary key, schema.ts:1297) and the unscoped queue serves ONE card per bit (`pickedVariants`, "one row per eligible bit", knowledge-bit-review-queue-picked.repo.ts). Reviews already log `variantId`; the grade request carries `variantId` (knowledge-bit-review.ts:80).
- Fact: the business prompt already emits `type: "cloze"`, but `toSourceItem` converts only a single `{{c::..}}` to `fill_blank`; multi-gap clozes return null and are lost (knowledge-bit-business-cards.agent.ts:85-110).
- Fact: web renders fill-in-the-blank by splitting the prompt on `____` into a bold `[...]`, answer in bold (anki-review-card.tsx:8-26,53,73). iOS does the same only for `fill_in_the_blank` (`DueReviewModel+Helpers.swift:33`); iOS keeps `kind` as a String with a default label, so an unknown kind does not crash decoding.
- Fact: editing a variant supersedes it and inserts a replacement (approval.repo `editKnowledgeBitQuestionVariant`); body edits supersede variants only when they have attempts, else regenerate. Latest migration on this branch is `0118_swift_wallflower.sql`.
- Fact: source-items insert stamps wh/fill/basic generation markers for the bit, so extra generation passes skip bits that arrive with their own variants (knowledge-bit-source-items.repo.ts:100-112).
- Assumption: "subject kind suits" = the existing `SubjectKind` switch in `runKnowledgeBitSourceItems` (language / business / other); no new subject taxonomy needed.

## Architecture decisions

1. One note = one knowledge bit. Each cloze number / list card = one variant row (new kinds `cloze`, `list_step`, `list_next`, `list_overview`). The note's canonical text lives in `sentence` on every sibling variant; `prompt` is the pre-rendered front (active gap shown as `____`, hint as `____ (hint)`), `answer` is the hidden text. Old consumers (browser, triage, chat, export) keep working off prompt/answer, the same degrade path fill-in-the-blank has.
2. Rendering is derived, not authored by the model: the AI only writes the marker text (cloze) or title + steps (list). Pure shared functions build every variant's prompt/answer, so generation, editing and iOS/web agree.
3. Independent scheduling needs one migration (below). Without it, c1/c2/c3 would share one schedule and the queue would rotate them as "one card per bit", which fails "each number its own reviewable card" and gives list steps one shared due date.
4. Sibling cards of one note are buried together until the end of the learner's day after one is graded (default, matches Anki; the existing bury field is reused). Reason: sibling fronts reveal each other's answers.
5. New kinds are excluded from typed-answer mode (`TYPED_VARIANT_KINDS` unchanged; grading them typed returns the existing 409 `kind_not_typed`).

## Data model

Reused: `knowledge_bit_question_variants` (kinds are free text; cloze number / step index in `order`; note text in `sentence`), `knowledge_bits.body` (plain readable statement, markers stripped, so search/embedding/tsvector stay clean), `knowledge_bit_reviews` (already per variant), existing bury field.

One migration needed (shared by A and B):
- Table `knowledge_bit_schedules`: add `card_key text not null default ''` and change the primary key from `(knowledge_bit_id)` to `(knowledge_bit_id, card_key)`. `''` = the existing bit-level schedule, so every current row keeps working with no data rewrite. New kinds use `card_key = "<kind>:<order>"` (e.g. `cloze:2`, `list_step:3`, `list_overview:0`).
- Why key by slot and not variant id: an edit supersedes a variant with a new id; slot keys let the replacement inherit the old schedule.
- Flag: another parallel plan also adds migrations. Number and journal entry are assigned later at merge time; generate via the existing migrate script, never push with the ORM. The migration is additive-compatible (default `''`), so deploy order is: migration, API, web (per anki-review.md rollout).
- Review-history snapshot (`prevSchedule`) needs no change; undo restores the row for the same card key (undo must resolve the key from the review's variant).

No other column changes. No new tables.

## Zod contract (`packages/shared`)

- `knowledgeBitQuestionVariantKindSchema` gains `cloze`, `list_step`, `list_next`, `list_overview`. `reviewCardSchema.kind` follows automatically.
- New `cloze.ts`: `parseCloze(text) -> { gaps: { n, answer, hint|null, start, end }[] } | error`, `renderClozeFront(text, n)`, `renderClozeAnswer(text, n)`, `stripClozeMarkers(text)` (for `body`), `editClozeNoteInput` (`{ note: string }` trimmed, max length same as body limit). Errors are a closed union: `empty_gap`, `nested`, `unclosed`, `no_gaps`, `too_many_gaps`, `gap_too_long`.
- New `ordered-list.ts`: `orderedListSchema` (`title` non-empty, `steps` array 3..8 of non-empty strings, each at most 120 chars, no duplicates), `buildOrderedListCards(list)` returning the full variant set, `parseOrderedListText` / `formatOrderedListText` (title on line 1, one step per line, canonical text kept in `sentence`), `editOrderedListInput`.
- `editKnowledgeBitQuestionVariantInput` becomes a union: today's `{ prompt, answer }` OR `{ note }` (cloze) OR `{ list }` (ordered list). The server rejects a mismatch between the variant's kind and the payload shape with 400.
- Review cards query gains optional `cardKinds` (comma list of capability tokens, e.g. `cloze,list`). Absent = new kinds are never served (older iOS builds stay safe); present = served. Held-back cards stay due, not lost.
- Tests live beside the schema files (`*.test.ts`).

## Rendering rules (cloze)

Marker grammar: `{{cN::answer}}` or `{{cN::answer::hint}}`, N a positive integer, case-insensitive `c`.
- Front for number N: gaps with number N show `____` (plus ` (hint)` if given); every other gap shows its plain answer, no marker.
- Back for number N: the same sentence with number N's answer in bold (web: `<strong>`, existing fill-blank-answer styling) and the answer line listing the hidden text.
- Same number used twice in a note: both gaps hide together on that card; `answer` is the hidden texts joined with ` / ` in reading order.
- Numbers need not be consecutive (c1, c3 ok); one card per distinct number.
- Web: the cloze kind reuses the existing `____` split renderer (the hint text survives as plain text after the blank); the check `kind === 'fill_in_the_blank'` becomes a shared `isBlankKind(kind)` helper covering `fill_in_the_blank`, `cloze`, `list_next`. The answer block for these kinds shows the filled sentence with the answer bold, not just the bare answer.
- iOS: same rule in the shared review-model helper (prompt split on `____`, bold answer) plus kind labels ("Cloze", "Step", "Next step", "Overview"); pending-review kind preference list gains the new kinds after `basic`.

Rendering rules (ordered list):
- `list_step` n: front "In <title>, what is step n?"; back is the step text.
- `list_next` n (n = 1..steps-1): front "<title>: after '<step n>' the next step is ____"; back is step n+1.
- `list_overview`: front "How many steps are in <title>? Name them in order."; back "<count> steps" followed by the numbered list. This card tests the count first, then recall.
- Card count is 2 x steps (steps + next-step cloze for all but the last, + overview); the 8-step cap bounds it at 16.

## Files by layer (A cloze, then B list)

**Shared (`packages/shared/src`)**: `knowledge-bit.ts` (enum, edit input union), `cloze.ts`, `ordered-list.ts` and their tests; `knowledge-bit-review.ts` (cardKinds query).

**DB (`apps/api/src/db`)**: `schema.ts` (schedule key) plus the generated migration (number assigned later).

**API repo / orchestrator (`apps/api/src/knowledge-bit`)**:
- `knowledge-bit-schedule.repo.ts`, `knowledge-bit-review.repo.ts`, `knowledge-bit-review-undo*.ts`, `knowledge-bit-review-suspension*.ts`: read/write by `(bitId, cardKey)`; key derived by a new `card-key.ts` helper from the variant (`''` for legacy kinds). Per-bit advisory lock stays per bit (siblings serialize, which is fine).
- `knowledge-bit-review-queue-picked.repo.ts` and `-queue-cards/-counts/-learning` repos, `topic-due.repo.ts`, `subject-review-due-counts.repo.ts`: the one-card-per-bit pick applies only to legacy kinds; each active cloze/list variant is its own queue item, due by its own schedule row. Counts include them.
- `knowledge-bit-variant-kind-rules.ts`: preference list gains the new kinds; typed list unchanged.
- `knowledge-bit-source-items.repo.ts` + `knowledge-bit-source-item-validation.ts`: `SourceItemKind` gains `cloze` and `ordered_list`; insert expands a note into sibling variants via the shared builders; bit body is the marker-stripped statement.
- `knowledge-bit-approval.repo.ts` / `-approval.controller.ts`: edit handles `{note}` / `{list}` (see Edit rules).
- New `knowledge-bit-note-edit.repo.ts` to keep the approval repo under the file-size guidance.
- Review-cards builder: serve `cardKinds` gating; bury siblings on grade.

**Agents (`apps/api/src/mastra`)**: `knowledge-bit-business-cards.prompt.ts` (new V4 constant, ACTIVE points to it, V3 kept for the side-by-side comparison the todo already uses), `knowledge-bit-business-cards.agent.ts` (`toSourceItem` maps multi-gap cloze to `cloze`, ordered lists to `ordered_list`), `knowledge-bit-source-items.agent.ts` ("other" subjects: add the two shapes to the lesson-card kinds rule). Language path (`runLegacyKnowledgeBitSourceItems`) is not touched.

**Web (`apps/web/src/knowledge-bit`)**: `anki-review-card.tsx` (blank-kind helper, filled-sentence answer), `anki-review-card-editor.tsx` (note/list editor modes with live preview of each card), `anki-review-session*.ts` (swap returned variant ids after a note edit that returns several), `anki-review.api.ts` (send `cardKinds`), `knowledge-bit-review-variant-list.tsx` and the triage/browser variant lists (kind labels, grouped siblings), mocks.

**iOS (`apps/ios`, separate slice, same plan)**: `PendingReviewModels.swift` labels, `DueReviewModel+Helpers.swift` blank rendering, `pending-review-triage-selection.swift` preference list, send `cardKinds`, fixtures in `PostAnkiAPI` tests.

**Docs**: update `docs/architecture/knowledge-bit/anki-review.md` (per-card schedule key, sibling burial, queue rule) and `variant-generation.md` (new kinds, produced by the source-items pass, not a separate pass) in the same change.

## AI generation rules

- Business prompt V4: allow `cloze` only when one sentence holds 2 to 5 independently testable key terms (definition with parts, a rule with conditions); written as `{{c1::..}}` in `front`. One term only stays `fill_blank` (current behaviour). New `ordered_list` type: `title` plus `steps` taken from the text in order, only when the text itself states an ordered process of 3 to 8 steps; never invent or reorder steps. Both still require the verbatim `source_quote`.
- Validator rules (code, not prompt): cloze passes `parseCloze`, 2..5 distinct numbers, each answer at most 120 chars (existing `SOURCE_ITEM_FILL_BLANK_ANSWER_MAX_CHARS`), marker-stripped statement is checked against the quote exactly like fill_blank; a list passes `orderedListSchema` and each step must appear in the source chunk (case-insensitive). Failing items are dropped to a basic card of the same lesson when possible, else dropped and logged (same flagged-lesson path).
- Cost: no new model call; same single lesson call with a slightly longer prompt. No retries added. Input remains untrusted `<source>`; marker text from the model is parsed by the strict parser, never executed or interpolated into prompts.
- Language subjects: untouched. Other subjects: shapes allowed but the prompt tells the model to prefer basic when unsure.

## Edit rules and edge cases

- Overlapping / nested clozes (`{{c1::a {{c2::b}}}}`): rejected with `nested` in AI validation and in the editor (400 with the error code shown inline). Crossing markers are the same case. v1 does not support nesting.
- Empty gaps (`{{c1::}}`, whitespace answer): rejected `empty_gap`. Empty hint (`::` followed by nothing) is treated as no hint. Unclosed marker: `unclosed`. A note with no gaps: `no_gaps` (editor suggests converting to a plain card; no conversion in v1).
- Same number twice: allowed, hides together. Same answer text under two numbers: allowed.
- Editing a cloze note that has reviewed cards: parse new text, compare numbers to active siblings.
  - Number still present: old variant superseded, replacement inserted in the same slot, schedule row kept via the slot key (progress kept). Sibling fronts that merely show changed neighbouring text are re-rendered the same way.
  - Number removed: variant superseded, its schedule row left in place but unreachable (history stays; undo of old reviews is blocked as not-latest).
  - Number added: new variant, new card (no schedule row = new, counts against the daily new cap).
  - Default decision: a changed answer under the same number keeps its schedule (Anki behaviour). The editor warns "this resets nothing; use Again if you no longer know it".
  - The whole edit is one transaction under the bit lock, then re-embed the bit, same as the existing variant edit. Blocked for rejected/superseded bits (existing 409).
- Editing one card of a note from the review screen edits the whole note (all siblings) — the session swaps every returned id.
- Excluding one sibling in triage/approval: allowed (variant-level exclusion); the other siblings' text is not rewritten, so they still show the excluded gap's answer revealed.
- Ordered list edits: the list is rebuilt deterministically. Cards are keyed by position, so inserting a step in the middle shifts later cards onto earlier schedules. Default: accept and document; alternative (content-keyed) rejected as costlier. Removing steps retires the highest positions; adding steps adds new cards. Fewer than 3 steps: rejected (`too_few_steps`).
- Duplicate step texts: rejected. Steps over the cap: rejected with the cap in the message.
- Body edit of a pending bit (existing clear-markers path) regenerates basic/wh/fill; for cloze/list bits it must NOT run those passes: bit keeps its own variants. Guard by skipping markers-clear when a bit has cloze/list variants, edited only through the note editor.
- Old iOS builds: not served new kinds without `cardKinds`; those cards simply wait.
- Leech / suspend / bury operate per card key; "suspend this card" suspends one cloze number, not the note.

## Tests (business guarantees)

Shared:
- A note with three numbers produces exactly three cards; each hides only its own gap and shows the others filled in.
- A repeated number hides both gaps on one card.
- Empty, nested, unclosed and gapless notes are refused with a clear reason.
- A hint appears next to the blank on the front and never on the back.
- A list of N steps produces N step cards, N-1 next-step cards and one overview card that states N.
- A list with duplicate steps, under 3 or over 8 steps is refused.

API:
- Grading c1 does not change when c2 of the same note is due (independent schedules).
- Grading one sibling hides the other siblings until the end of the learner's day.
- Existing bits' schedules keep working unchanged after the migration (empty card key).
- The unscoped queue serves each due cloze number but still one legacy card per bit; new-card cap counts each cloze card.
- Without `cardKinds`, cloze/list cards are not served and remain due.
- Undo of a sibling's grade restores only that card's schedule.
- Editing a cloze note keeps progress of unchanged numbers, retires removed numbers, and makes added numbers new cards.
- Editing a rejected bit is refused; a payload shape not matching the card kind is refused.
- Typed-answer mode refuses cloze and list cards.
- Multi-gap AI output becomes sibling cards; single-gap output still becomes fill-in-the-blank; language-subject extraction output is byte-identical to before.
- AI output whose gap text is not in the source is dropped; a list with invented steps is dropped.
- Cloze and list bits are not given extra basic/why/fill cards by the generation passes.

Web:
- The review card shows the blank with the hint, then the filled sentence with the answer bold after reveal.
- The overview card reveals the numbered list.
- Editing a note from review shows inline errors for empty/nested gaps and swaps all returned card ids in the session.
- Triage and browser group siblings under one note.

iOS (follow-on slice): the same rendering and decoding guarantees with fixtures covering each new kind.

## File ownership

- Slice A1 (shared + DB + queue/schedule/undo/suspend): owns `packages/shared/src/{knowledge-bit,knowledge-bit-review,cloze,ordered-list}.ts`, `apps/api/src/db/schema.ts` (schedule block only), migration, `knowledge-bit-schedule/review/queue/topic-due/subject-review-due` repos, kind rules, card-key helper.
- Slice A2 (generation + edit): owns `mastra/knowledge-bit-business-cards.*`, `knowledge-bit-source-items.agent.ts`, `source-item-validation`, `source-items.repo`, `approval.repo/controller` edit path, note-edit repo.
- Slice A3 (web): owns `apps/web/src/knowledge-bit/anki-review-*`, variant lists, mocks.
- Slice B: owns `ordered-list.ts`, prompt V4 list section, list branches of validation/insert/edit, web list editor; touches no A1 file beyond adding kinds.
- iOS slice: owns `apps/ios/**` review models and helpers only.
- Shared hot files (`schema.ts`, `knowledge-bit.ts`, `docs/.../anki-review.md`) are touched by A1 first; B rebases onto A1. The parallel migration plan must not edit the schedule table block; migration number assigned at merge.

## Open items and risks

- Flag (decision for the owner): the schedule key migration widens blast radius into the grade/undo/queue paths. Cheaper alternative with no migration: all gaps share one bit schedule and rotate via the existing "least recently shown" pick; rejected because it breaks "each number its own reviewable card" and gives list steps no independent due dates.
- Risk: sibling burial uses the existing per-card bury field; if bury is already used by the learner manually, auto-bury must not extend a longer manual bury.
- Risk: list cards up to 16 per note inflate the daily new-card cap use (20/day); consider counting one note's new cards as a group later. Not in scope.
- Out of scope: creating cloze/list notes by hand or via chat card proposals, converting basic to cloze, typed-mode cloze, language-subject cloze.

END-OF-REPORT
