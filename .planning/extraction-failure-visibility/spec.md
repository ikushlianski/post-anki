---
type: spec
branch: learn-from-doc-site
task: Make every failed or empty note extraction visible in the web UI, and never hide AI cards the validator rejected
complexity: complex
state: confirmed
updated: 2026-10-25
---
# Spec: Extraction failure visibility

## The ask
Owner, verbatim: "even if something goes wrong (which it can be), the ui needs to notify the user about it". Addendum, verbatim: "and retry button or manually review or sth. dont prevent the user from seeing their cards!"

Trigger case: two raw notes were added in Add knowledge (local), both ended status failed with reason no_valid_items, nothing appeared in Knowledge triage and the UI said nothing.

## Summary
A note can currently end with no usable cards and the user is never told. After this change the AI's rejected cards are kept in triage marked "Needs manual review" with a plain reason, so the user can edit and approve them. When the AI returned nothing at all, or the note failed, stalled, or hit a rate stop, Knowledge triage shows a notice with the note's first words, time, a plain reason, and Retry now / Edit text and retry / Discard. The sidebar count includes those notices.

## Facts (from code)
- Failed notes keep a short code in the source row's failure_reason (apps/api/src/db/schema.ts:1134). Known codes: no_valid_items, wrong_language, source_empty, source_too_long, source_chunk_missing, knowledge_source_reclaimed (apps/api/src/knowledge-bit/durable-extraction.config.ts:35), extraction_failed (same file, generic), provider_rate_limited (apps/api/src/knowledge-bit/extraction-inngest.errors.ts:5), workflow_executor_lost (apps/api/src/knowledge-bit/knowledge-bit.repo.ts:539). The legacy path can also store up to 200 characters of raw error text (detect-knowledge-bits.orchestrator.ts:94). While a durable run is active the field holds a "durable:" owner token (knowledge-bit.repo.ts:331).
- A card the validator rejects is dropped; only a reason code survives (knowledge-bit-source-item-validation.ts:211 validateSourceItems returns valid lessons plus dropped reason codes). If a chunk has zero valid lessons after one retry the chunk throws no_valid_items (detect-knowledge-bits.orchestrator.ts:166) and the whole note fails. Same in durable-extraction.steps.ts:132.
- Rejection reasons: empty, too_long, quote_length, quote_not_in_source, wrong_language, source_meta_reference, bad_card, unsafe_content, bad_blank, answer_not_in_statement.
- Triage entries are rows in the bits table (state pending) plus variant rows holding question and answer (knowledge-bit-source-items.repo.ts:99). The triage read lists only pending bits that join a source and returns nothing for a source with no bits (knowledge-bit-approval.repo.ts:190). The sidebar count is the number of pending bits in unprocessed sources (knowledge-bit-bulk-approval.repo.ts:80), polled every 60s and refreshed by a browser event (apps/web/src/nav/sidebar.tsx:12).
- Retry already exists: regeneration claims a failed or detected source, supersedes pending bits and re-runs (knowledge-source-regeneration.repo.ts:12). It refuses a source stuck in processing. Triage already polls regeneration status every 3s (knowledge-bit-review-regeneration.ts). Discard exists: deleting a source (DELETE /knowledge-sources/:id).
- Study material failure display prints the stored reason raw (apps/web/src/study-material/study-material-item.tsx:32); it is a different table and out of scope.
- Add knowledge shows only a success message after submit (apps/web/src/knowledge-source/add-knowledge-form.tsx); it never learns the later outcome.

## What changes
1. Rejected cards are kept: validation returns the rejected drafts with reasons; those except unsafe or empty ones are stored as pending bits with a review flag holding the reason code. A note fails with no_valid_items only when the AI returned no cards at all.
2. One shared reason-to-wording map in the shared package, used by web (and any later client). Raw stored text is never shown.
3. The existing count read gains an attention count; the existing triage read gains attention entries when asked (web asks, iOS does not).
4. Triage page shows a "Needs attention" block above the groups; flagged cards show an amber banner with reason and still use the normal edit and approve flow.
5. Retry now reuses regeneration; Edit text and retry extends regeneration with optional replacement text; Discard reuses source delete. Regeneration may also take over a note stuck in processing past the stale limit.
6. Add knowledge success text points to triage and the sidebar shows an attention marker.

## Decisions made autonomously
- Flag storage needs one additive nullable column on the bits table (migration generated and run through the existing migrate script). Reason: no existing bit column can carry a per-card reason without corrupting its meaning, and a source-level marker cannot tell flagged cards from clean ones in the same note. Fallback if the owner refuses a migration: a source-level marker used only when a note has zero clean cards.
- Rejected cards kept: every rejection except unsafe_content and empty (never shown, counted in the notice text only). Cap 3 flagged per chunk, counted in the 40 per note limit. Quote-mismatch cards show "quote could not be matched to your note" and are approvable.
- Flagged cards are approvable one at a time; bulk approve skips them so nothing flagged enters review unseen.
- Notices stay until resolved. No timed expiry, no separate dismiss. Resolve by Retry (replaced when the new run finishes), Edit and retry, or Discard (confirm step, deletes the note and its raw text).
- Notice kinds: failed (any failure code, including unknown), empty result (note finished with no live cards and not marked done), stuck (processing longer than 20 minutes), waiting on rate limit (processing, reason rate limited: shown as info, not error, with Retry only after stuck threshold).
- No budget stop exists for extraction today (the budget code is in subject check only); the generic and rate-limit wording covers it, and a budget code added later falls under the generic wording until mapped.
- Attention list is fetched once with the triage page load and re-fetched on the existing refresh event; no new polling loop. Sidebar keeps its single 60s read.
- Count shown in sidebar: pending cards plus attention notes, with attention notes also marked by a dot, so the badge never reads zero while a note failed.
- iOS: no change now. Follow-up note only (see architecture.md).

## Reason wording (shared map)
- no_valid_items: "The AI could not produce a usable card from this note."
- wrong_language: "The AI wrote cards in a different language than your note."
- source_empty: "This note has no text."
- source_too_long: "This note is too long (over 50,000 characters). Split it and add the parts separately."
- source_chunk_missing / extraction_failed / workflow_executor_lost / knowledge_source_reclaimed / anything unknown: "Something went wrong while reading this note. Retry usually fixes it."
- provider_rate_limited: "The AI service is busy. This note will be tried again, or retry in a few minutes."
- stuck: "Still working after more than 20 minutes."
- empty result: "The AI finished but found nothing to turn into a card."
- Card flags: bad_card "The card is not a good question and answer pair", source_meta_reference "The card refers to the note itself instead of the content", wrong_language, quote_not_in_source and quote_length "The supporting quote could not be matched to your note", too_long "The card is too long", bad_blank and answer_not_in_statement "The fill-in-the-blank is malformed".

## Scope boundary
- Out: study material failure display, iOS Swift work, knowledge browser files, subject-check budget wording, changing extraction prompts or validation strictness.

## Files to modify (by area)
- API: knowledge-bit validation and orchestrator, durable steps, source-items repo, approval repo (list and approve), bulk approval repo (count and skip), regeneration repo and controller, router table, db schema plus one migration.
- Shared: knowledge-bit contracts, new extraction-failure wording module.
- Web: knowledge-bit review page, panel, source group, new attention notice component, sidebar, add-knowledge form, api-client and server functions.

## Seed data
Four notes: one failed no_valid_items, one failed too long, one finished with zero cards, one stuck processing; plus one note with two flagged cards and one clean card.

## Risk & rollout
Additive column and additive response fields; iOS and existing web reads keep working because attention entries are opt-in and the count gains a field. Risk: flagged cards raise the share of low-quality cards reaching triage, mitigated by the flag banner and bulk-approve skip. Migration must run before API deploy.

## Documentation changes
Update docs/architecture ingestion pipeline doc (apps/api/src/knowledge-bit/ingestion-pipeline.md) with the rejected-card and attention flows in current-state wording.
