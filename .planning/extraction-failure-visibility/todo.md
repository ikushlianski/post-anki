# Todo: Extraction failure visibility

## keep-rejected-cards

### Scope
- Keep cards the checks rejected as flagged triage entries the user can edit and approve
- Out of scope: Changing prompts or validation strictness

### Goal
- Cards the AI wrote but checks rejected reach triage flagged for manual review instead of vanishing.

### Criteria
- [x] Rejected card appears in triage flagged
- [x] Flag shows plain reason
- [x] Flagged card editable and approvable
- [x] Bulk approve skips flagged cards
- [x] Note fails only when AI returned nothing

### Coding tasks
- [x] Make the card checks return rejected cards together with their reasons.
- [x] Add one optional review-flag field to saved cards and generate the migration.
- [x] Save rejected cards as flagged pending cards, never unsafe or empty ones, capped at three per chunk.
- [x] Fail a note only when the AI returned no cards at all, in both extraction paths.
- [x] Return the flag on triage cards, clear it on approve, and make bulk approve skip flagged cards.
- [x] Add tests for mixed notes, all-rejected notes, empty AI output and retry replacing flagged cards.

### Notes
- Owns apps/api/src/knowledge-bit/ validation, extraction, approval, bulk approval and apps/api/src/db/schema.ts
- Depends on none. Migration runs before API deploy.

## failure-reasons-and-attention-read

### Scope
- Shared plain wording for every failure code and one attention read on existing endpoints
- Out of scope: Study material failure display

### Goal
- One shared wording map and the existing reads tell clients which notes need attention.

### Criteria
- [x] Every failure code has plain wording
- [x] Unknown reasons use generic wording
- [x] Count read includes attention count
- [x] Triage read returns attention entries on request
- [x] Existing clients see no change

### Coding tasks
- [x] Write the shared failure wording map covering every known code plus a generic fallback.
- [x] Add card flag wording and attention notice kinds to the shared contracts.
- [x] Work out which notes need attention from status, age and live card count.
- [x] Add the attention count to the existing pending count response.
- [x] Let the triage read return attention entries only when the web app asks for them.
- [x] Add tests for each failure code, unknown text, empty-result notes and iOS-shaped requests.

### Notes
- Owns packages/shared/src/ new wording module, apps/api/src/knowledge-bit/ approval and bulk approval reads
- Depends on keep-rejected-cards for the card flag field.

## note-actions

### Scope
- Retry now, Edit text and retry, Discard, and taking over stuck notes
- Out of scope: Changing how extraction itself runs

### Goal
- The user can retry, edit and retry, or discard any note needing attention.

### Criteria
- [x] Retry now restarts a failed note
- [x] Edited text replaces note text on retry
- [x] Invalid edited text is refused
- [x] Stuck note can be taken over
- [x] Discard removes the note after confirm

### Coding tasks
- [x] Let regeneration start accept optional replacement text with the same length rules as adding a note.
- [x] Let regeneration take over a note stuck in processing past the stale limit.
- [x] Pass the replacement text through the web server function and API client.
- [x] Add tests for claim races, stuck takeover, refused edits and the old run losing its writes.

### Notes
- Owns apps/api/src/knowledge-source/ regeneration repo and controller, apps/web/src/knowledge-bit/knowledge-bit-review.api.ts
- Depends on failure-reasons-and-attention-read for the stuck rule.

## triage-attention-ui

### Scope
- Needs attention notices, flagged card banners and sidebar signal in the web app
- Out of scope: Knowledge browser and iOS

### Goal
- Knowledge triage and the sidebar show every note that ended badly, with actions.

### Criteria
- [x] Notice shows first words, time and reason
- [x] Notice offers three actions
- [x] Flagged cards show amber banner
- [x] Sidebar count and dot include notices
- [x] Notices stay until resolved

### Coding tasks
- [x] Build the Needs attention block above the note groups on the triage page.
- [x] Show first words, time, plain reason and the readable note text in each notice.
- [x] Wire Retry now, Edit text and retry and Discard with confirm, reusing the existing retry polling.
- [x] Show an amber Needs manual review banner with the reason on flagged cards.
- [x] Make the sidebar show pending plus attention count and a dot, never zero while a notice exists.
- [x] Add component tests for each notice kind, flagged banner, actions and sidebar count.

### Notes
- Owns apps/web/src/knowledge-bit/ review page, panel, source group and new notice, apps/web/src/nav/sidebar.tsx
- Depends on note-actions and failure-reasons-and-attention-read. Avoid knowledge browser files.

## add-knowledge-feedback

### Scope
- Add knowledge success message points to triage where problems show
- Out of scope: Live progress tracking in the form

### Goal
- After adding a note the user knows where to look if something goes wrong.

### Criteria
- [x] Success message names Knowledge triage
- [x] Message says problems will show there
- [x] Sidebar refreshes right after adding

### Coding tasks
- [x] Change the Add knowledge success message to point to Knowledge triage for any problems.
- [x] Make sure the sidebar count refreshes right after a note is added.
- [x] Update form tests and the ingestion pipeline doc with the new failure and flag flows.

### Notes
- Owns apps/web/src/knowledge-source/add-knowledge-form.tsx and apps/api/src/knowledge-bit/ingestion-pipeline.md
- Depends on triage-attention-ui. iOS needs a follow-up to show attention notes, no Swift work here.

