# Knowledge-bit ingestion pipeline

## Trigger

A user pastes text, submits a batch of texts, or imports a URL via `POST /api/knowledge-sources` (`knowledge-source.controller.ts`). After the row is saved and the 201 response is sent, the controller calls `kickPipelineInBackground()`, which calls `kickKnowledgeBitPipeline()` from the kick orchestrator in a detached promise. Any rejection is logged and swallowed so it never surfaces to the caller.

## Pre-save subject check

Before the save above, the Add knowledge form asks `POST /knowledge-sources/subject-checks` for advice when the Subject is blank. A chosen subject or a preselected leaf subject sends no request; a preselected parent limits suggestions to its sub-subjects. The check is read-only and stores nothing except one LLM call log row.

- The orchestrator (`knowledge-source-subject-check.orchestrator.ts`) applies the server switch `SUBJECT_CHECK_ENABLED`, the hourly cap of 30 checks (counted from the call log), and the daily spend guard, then shortlists at most 15 leaf subjects, makes one cheap-tier agent call with a 12 second timeout, and validates the answer.
- Pasted text is untrusted. The agent sees escaped excerpts in tags and candidates as aliases (`S1`, `P1`), never real ids. Aliases that were not offered are dropped, names and reasons lose markup and line breaks, and a new-subject proposal is dropped when a high-confidence recommendation exists or its name clashes with a sibling.
- The response is always HTTP 200 for valid input: `ok` (up to three ranked recommendations and an optional new-subject proposal), `none`, or `unavailable` with reason `disabled`, `budget`, `rate_limited`, `timeout` or `failed`. Invalid input gets 400.
- The form never saves automatically. The owner taps a suggestion, accepts a proposed new subject (created through the existing create-subject call, then saved under its id), picks another subject, or adds without a subject. `none` and `unavailable` save the text unfiled with a visible notice. Declining suppresses a re-check until a block is edited.
- Saving then follows the unchanged flow above, so a subject chosen through a suggestion sets the extraction style exactly as a manual pick.

## Kick orchestrator (`knowledge-bit-pipeline-kick.orchestrator.ts`)

The orchestrator runs a fixed, ordered list of passes. Each pass calls an independent scan that processes all currently-claimable rows for its stage:

| Pass name | Orchestrator module |
|---|---|
| `detect` | `detect-knowledge-bits.orchestrator.ts` |
| `wh_question` | `knowledge-bit-question-generation.orchestrator.ts` |
| `fill_blank` | `knowledge-bit-fill-blank-generation.orchestrator.ts` |

Passes run in sequence. A pass failure is caught, logged, and recorded as `"failed"` in the run summary — it does not stop the remaining passes.

Concurrent kicks coalesce: if a kick arrives while a run is already in progress, a single follow-up run is queued (not a second parallel execution). At most one run is active and at most one follow-up is pending at any time.

## Passes

**detect** claims `pending` knowledge sources (up to `DETECT_BITS_BATCH_CAP = 20` per scan), sends each source's text to the Mastra extraction agent in chunks, validates the returned items, and marks the source `bits_detected`. A chunk whose text holds `{{cN::answer}}` or `{{cN::answer::hint}}` markers is turned into one cloze bit by code (`detectImportedCloze`) with no model call: the text up to the end of the line holding the last marker is the note, parsed with `parseCloze` and at most `CLOZE_NOTE_MAX_CHARS`, and the rest of the chunk (cut at 200 chars) is the bit background. A chunk with no marker or a malformed one (nested, unclosed, empty gap, too long) goes to the model as usual. Sources left in `processing` for more than `STALE_PROCESSING_THRESHOLD_MS = 15 min` are reset to `pending` before each scan.

**wh_question** claims approved knowledge bits that have no WH question yet (up to `QUESTION_GENERATION_CAP = 50` per scan), calls the question-generator agent (concurrency 4), and stores each accepted variant.

**fill_blank** follows the same claim-generate-store pattern for fill-in-the-blank variants.

**subject_assignment** picks a subject proposal for sources that have cards but no owner-chosen subject and have not been checked (up to 10 per scan, switch `SUBJECT_ASSIGNMENT_ENABLED`). Each source goes through the existing cheap subject check (`runSubjectCheck`, same hourly cap and spend guard). High and medium confidence results are stored as-is. Low confidence and no-match sources are collected and sent in one batch to a balanced-tier agent (30 second timeout, no retries) that must answer with an offered subject alias or nothing. The proposal is stored on the source (`suggested_subject_id`, `suggested_subject_confidence`); `subject_id` is never written and a source is checked once. Rarely, when the cheap check was unclear or low confidence, the balanced agent found no fit and the cheap check proposed a new subject, one cheap Gemini agent call (12 second timeout, no retries, once per source) may create that subject. It must answer create with high confidence, a name of allowed characters that does not equal, contain, sit inside or nearly match any existing subject name, and a parent within depth 3; the excerpt must also not resemble any existing subject (cosine similarity below 0.55). Creation is capped per day (`SUBJECT_AUTO_CREATE_DAILY_CAP`, default 3), switched by `SUBJECT_AUTO_CREATE_ENABLED`, and respects the spend guard; any failed check leaves the source with no subject. The new subject is stored only as the source's suggestion with medium confidence, so the owner still approves it in Triage. When the check is disabled or out of budget the scan stops and leaves the rest unchecked. `GET /knowledge-bits/pending-review` returns `suggestedSubjectId`, `suggestedSubjectName` and `suggestedSubjectConfidence` per source, empty when the owner set a subject.

## Extension

To add a new pass, append a `{ name, run }` entry to `KNOWLEDGE_BIT_PIPELINE_PASSES` in the kick orchestrator. The orchestrator handles ordering, error isolation, and coalescing automatically.

## Error contract

- A pass rejection does not propagate beyond the run loop — it is logged as `pass_failed` and the run continues.
- A kick rejection (e.g. the entire run loop throws) is caught in `kickPipelineInBackground` and logged as `knowledge_bit_pipeline_kick_failed`. The HTTP response has already been sent, so the caller is unaffected.
- There are no unhandled rejections from kick calls.

## Failure handling and visibility

A note never ends silently. Every outcome is either cards in Knowledge triage or a visible notice there.

### Flagged cards

- Cards the validators reject are kept, not dropped. They become pending bits with `review_flag` set to the rejection code (for example `quote_not_in_source`, `bad_card`, `wrong_language`). Unsafe (`unsafe_content`) and empty cards are never kept.
- At most `FLAGGED_MAX_PER_CHUNK = 3` flagged cards are kept per chunk, deduplicated by statement.
- In a mixed lesson the clean cards stay in the normal bit and the rejected ones become a second flagged bit.
- Flagged cards are editable and approvable one at a time; approve clears the flag. Bulk approve skips them with the skip reason `needs_manual_review`, so nothing flagged enters review unseen.
- A note fails with `no_valid_items` only when a chunk gets nothing at all from the AI. Cards still in the wrong language after the strict retry are kept flagged instead of failing the note.

### Attention rules

A note needs attention when any of these hold (derived from the notes table, not stored):

- `failed`: status is failed.
- `empty_result`: finished, has no live cards, and is not marked done.
- `nothing_extracted`: finished with the nothing-extracted marker and no live cards (see below). Listed in triage attention, but not counted in `attentionCount`, so the sidebar badge stays quiet.
- `stuck`: still processing after `EXTRACTION_STUCK_AFTER_MS` (20 minutes).
- `rate_limited` (info only): processing under 20 minutes with failure reason `provider_rate_limited`.

`GET /knowledge-bits/pending-review/count` returns `attentionCount` next to `count`. `GET /knowledge-bits/pending-review?attention=1` adds card-less attention entries (merged into the group if the note still has cards). Without the parameter the list is unchanged, so clients that do not ask (iOS) are unaffected.

### Nothing extracted

- The lessons prompt and the business card prompt may return an empty list when the text has no practical value (greetings, filler, narrative with no takeaway); a short note that states one claim must still yield a card. The language-subject path is unchanged.
- A deliberate empty is not retried, makes no cards-agent call, and is not an error. The runner reports it through `onNothingWorthKeeping`; `writeAndValidate` returns `deliberateEmpty`.
- When every chunk is a deliberate empty and nothing was inserted, the note finishes as `bits_detected` with `knowledge_sources.nothing_extracted_at` set (all three paths: inline, durable, Inngest). Any later successful finish clears the marker, so Retry anyway replaces it.
- Invalid or unquoted lessons, or an empty list that was not reported as deliberate, keep the retry and `no_valid_items` failure.
- Guard against over-eager empty: `knowledge-bit-nothing-extracted-eval.fixture.ts` holds valuable short notes (must yield a card) and filler (must yield nothing). Run against a real model with `npm run eval:nothing-extracted -- --run` and `EVAL_REAL_MODEL=1`.

### Plain reasons

Stored failure codes are mapped to plain wording in `packages/shared/src/extraction-failure.ts` (`extractionFailureWording`, `attentionWording`, `cardFlagWording`). Unknown codes and raw error text fall back to a generic message; raw text is never shown.

### Retry, edit and retry, discard

- Retry now and Edit text and retry both call `POST /knowledge-sources/:id/regeneration`. The optional `text` (1 to 50,000 characters) replaces the note text in the same atomic claim. Pending bits, flagged included, are superseded in the same transaction; approved and rejected bits are untouched.
- The claim accepts failed and finished notes, and a note stuck in processing for over 20 minutes (takeover). A fresh processing note returns `already_running` (409). The takeover bumps the claim time so the old run fails its ownership checks and cannot write.
- Discard is `POST /knowledge-sources/:id/discards`. Without approved cards it deletes the note and all its bits. With approved cards it removes only the non-approved cards, keeps the note and approved cards, and clears the failure. Unknown notes return 404.

### Add knowledge feedback

After a note is added, the Add knowledge screen names Knowledge triage as the place problems show and refreshes the sidebar count. It then polls `GET /knowledge-sources/:id/regeneration` every 3 seconds (up to 200 polls) and shows queued, working, ready with N cards (and how many need a manual check), or needs attention with the plain reason and a link to Knowledge triage.

## Long pastes

- Trigger: the single-text branch of `POST /knowledge-sources` (not `texts`, not `url`) when the trimmed text is at least 8,000 characters and `LONG_PASTE_SPLIT_ENABLED` is not off. It runs after the exact-text duplicate check.
- One cheap-tier call returns 2 to 12 `{ title, startQuote }` sections (output capped at 800 tokens, 20 s timeout, no retry). The model never returns text: code finds each quote in order with `indexOf` and slices the original, so parts are verbatim and join back to the paste; text before the first quote joins part 1, a part under 1,000 characters merges into the previous one, and fewer than 2 parts means no split. Pasted text is untrusted data inside `<source>`; titles are stripped of markup.
- Parts become ordinary `prose` sources (same subject, model, target phrases, URL; title via `withPageTitle`) with `import_key` `split:<16 hex of sha256(subject, text)>:<n>`, one kick for all ids, and a 201 with the first source plus `partIds`. Extraction is unchanged.
- Guards: 20 splits per hour (counted from `llm_call_events` op `long_paste_split`, in-flight included) and the daily budget guard. Any failure (disabled, cap, budget, timeout, invalid output, unusable quotes) is logged and the paste is saved as one source with today's response.
- Re-pasting the same text answers 409 `already_added` through the key base; `force: true` splits again and writes no keys.

## Meeting phrases

- Trigger: `POST /knowledge-sources/phrases` with `lines` (1 to 100 strings, each up to 500 characters). The caller splits the page text; nothing is read from or written to Notion by the API.
- `parsePhraseLines` (core) strips list markers and formatting, moves a trailing parenthesis, an ` = ` tail or a Cyrillic gloss into a hint, removes an unsure marker (`??`, `???`, `?!?`, `(?)`; `detectUnsureMarker`) and marks the phrase unsure and drops lines with no Latin letter and repeats inside the post. The response counts `received`, `imported`, `skippedExisting`, `ignored` and `duplicatesInInput`.
- Each new phrase is one `knowledge_sources` row of kind `phrase` (`Phrase: ...`, optional `Hint: ...`, optional `Unsure: yes`) under English / English for IT; both subjects are created on the first post if missing. The row's `import_key` (`phrase:` plus the lowercased, punctuation-free phrase) is unique, so a repeated phrase inserts nothing and starts no extraction. A failed source keeps its key; a discarded one frees it.
- Extraction reads the source kind (`WriteOptions.sourceKind`) before the subject kind and uses the meeting-phrase writer: one model call returns 3 situations (situations[i] is the front cue for sentences[i]: the Russian meaning of the phrase in that sentence plus an English near-synonym in parentheses, never the phrase itself), an optional shared context and up to 3 sentences that contain the phrase word for word (the AI-corrected phrase when flagged). Each valid sentence becomes a basic variant of the same bit: front = that sentence's own situation (plus the shared context; the older single `situation` fills any missing front), back = the sentence; the bit body stays the phrase. A sentence that rewords the phrase is dropped; when none is valid the call is repeated once, then the bit gets one card with the phrase on the back. Whole source text is the supporting quote.
- Choice rule: a pending bit of a phrase source with 2+ active variants is listed with `answerChoice: true`. Triage keeps the chosen sentence through `POST /knowledge-bits/:id/triage` (`keepVariantIds`) and drops the others; plain approve of such a bit keeps only the first sentence, and bulk approve skips phrase bits as `needs_manual_review`.
- Backfill: `npm run backfill:phrase-sentences` lists phrase sources whose live bits are all pending and whose variants share one front (a single card or three cards under the same front) and the expected model calls (dry run by default; `--apply`, `--allow-remote`, `--limit N`). Apply regenerates only those pending cards; approved cards are untouched and pending edits are lost.
- A phrase the model finds non-native, or one marked `???`, gets `review_flag = non_native_phrase` and the better version in `knowledge_bits.ai_suggestion`. Flagged cards are skipped by bulk approve; approving one clears the flag and keeps the suggestion. Triage and review show the original beside the suggestion with the AI badge. An unsure phrase appears in the prompt with a note that the learner doubts it; the model verifies the phrase spelling and the hint translation and returns the corrected phrase as the suggestion. Phrases without a marker get no note.

## Highlights

- A single-text add may carry up to 20 `highlights` (`{start,end}`, UTF-16 offsets into the submitted trimmed text, half-open), merged and sorted (`mergeHighlights`); out-of-range or malformed ranges are 400 `invalid_input`, and batch or url adds reject the field. Marks are stored in `knowledge_sources.highlights`, shifted by the `Page: <title>\n` prefix so they index the stored text. They are not part of duplicate identity.
- A marked source is never split. `chunkSourceTextWithOffsets` keeps each chunk's source offsets; chunks without marks are skipped (original chunk index and ordinals kept), marked chunks get a `<focus>` block of escaped `<excerpt>` entries after `<source>`. The lessons rules treat focus as untrusted data, and a lesson is kept only when its quote overlaps a marked span. If the marks hold no usable text the source ends as nothing extracted.
- Replacing the source text on regenerate clears the marks; a plain regenerate reuses them.

## Target phrases

- A pasted source (text, texts or url) may carry up to 5 target phrases (each trimmed, 1 to 200 characters, deduplicated case-insensitively) in `knowledge_sources.target_phrases`; a batch applies them to every text.
- Extraction loads them with the source kind (`WriteOptions.targetPhrases`) and the language-subject prompt adds an `<target_phrases>` block of escaped `<target_phrase>` entries. They are untrusted data: the model prefers items about the source's content that involve them, never invents facts, and ignores a phrase the source does not contain.

## Notion sources

- A source is one Notion page (`notion_ingestion_sources`): name, page link (https, `notion.so` or `notion.site`; only the 32-hex page id is ever sent to Notion), target subject, items per run (1 to 100, default 20), frequency (`manual`, `daily`, `nightly`), a remove-after-import switch (default off) and a paused flag. A page can be a source once. The only pipeline is `meeting_phrases`, which imports through the same function as `POST /knowledge-sources/phrases`.
- A run reads up to 500 top-level blocks, skips lines already imported before counting, imports at most "items per run" new lines, and records a row in `notion_ingestion_runs` with the counts. Lines over 500 characters or with no phrase count as ignored. The daily LLM budget is checked first: when it is used up the run is recorded as `skipped_budget` and nothing is read or imported.
- With the switch on, only the blocks imported in that run are deleted from Notion, after the import returned. A block with nested children is never deleted. A failed deletion makes the run `partial` and never undoes the import.
- `POST /notion-sources/:id/runs` (Ingest Now) runs inline and answers 409 `already_running` while a run started in the last 10 minutes has not finished. Deleting a source leaves Notion and the imported cards alone.
- `POST /notion-source-runs` is the scheduler tick (Cloud Scheduler, every 15 minutes). It takes unpaused, non-manual sources whose `next_run_at` has passed, claims each with a compare-and-set on `next_run_at` (so two ticks never run the same source), leases the source for 20 minutes (`next_run_at` = now + 20 min) while it runs, so a run lost to a crash becomes due again; when the run ends, whatever the outcome, `next_run_at` moves to the next slot (daily: +24 h; nightly: 01:00 UTC), so a failing source does not repeat. A source that is already running, or a tick that hits `skipped_budget` (which also ends the tick), gets its old due time back. A tick starts no new source after about 240 seconds, and a database error on one source marks only that source failed. `npm run notion-sources:run` runs the same tick locally; `npm run notion-sources:register -- <page url> --english-phrases` adds the English phrases page.
- The Notion token is read from the encrypted `connector_secrets` row (key `CONNECTOR_SECRET_KEY`), else from `NOTION_TOKEN`. No response or log line carries it.

## Ask-AI cue

- The lessons result carries optional `needsClarification` and `gapText` (max 300 chars). The model sets them when the learner's text says they lack understanding or want to ask AI; the text stays untrusted and the flag only restricts extraction and opens a chat.
- Chunk results carry the first `gapText`; the finish step takes the earliest flagged chunk and opens at most one chat per source (`ask-ai-chat.orchestrator.ts`). The chat bit has the fixed id `kbask_<sourceId>`, so retries and regeneration never duplicate it.
- The bit is created in `chat` state before the source is marked done; the first reply (cheap tier, 2 searches, 1 page fetch) is generated after. At most 3 auto-chats per hour get a reply; further ones still appear in the Inbox without messages and wait. Each Inbox list request starts a background sweep that answers up to 2 such waiting chats (ids `kbask_*`, no messages) once the hourly count is back under the cap, so a held first reply is generated later even though the source is already done. Replies also count toward `CHAT_QUEUE_HOURLY_CAP`.
- A source with a opened chat and no lessons is not marked "nothing extracted".
