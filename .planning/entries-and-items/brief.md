# Entries, knowledge items by hand, processed state and source container

## Goal

The user reviews suggestions extracted from pasted or uploaded text. They want to add missing knowledge items (KI) by hand to the same text, keep a fully reviewed text on the page until they decide it is exhausted (state processed), and later group texts under a named source. Vocabulary is in docs/architecture/knowledge-bit/domain-vocabulary.md.

## Architecture

- **Entry** (today table `knowledge_sources`, later `knowledge_source_entries`): one piece of raw text, kind excerpt (pasted) or document (uploaded). Owns the extraction state and, new, `processed_at` (null = open). Only the user sets or clears it, through two routes (mark processed, reopen); no automatic transition.
- **Knowledge item** (today `knowledge_bits` plus one `knowledge_bit_question_variants` row per card): new column marking its origin (`extracted` default, `manual`). Manual items are excluded from every per-model statistic, memory block and suggestion score (all queries that read `knowledge_bit_feedback`, `knowledge_source_extraction_grade` or compare model results must filter them out or never see them).
- **Hand-made item route** (API): create one KI on an existing entry with front, back, optional example. Server rejects empty front or back after trim. It creates a pending bit (approval_state pending, origin manual, ordinal after the last), one basic variant (prompt = front, answer = back), background = example, and stamps the generation columns like the extraction insert so background scans never touch it. It never calls a model.
- **Approve page** (web, `apps/web/src/knowledge-bit`): a fully reviewed entry stays listed with its Regenerate and Compare links until the user marks it processed; processed entries sit in a collapsed Processed section with Reopen. The sidebar badge counts only open items. An 'Add new KI' button on each entry opens a draft card (Front, Back, Example textareas, borderless, 44px phone targets); the draft lives only in the browser and is created on the server only when Front and Back are non-empty; Cancel discards it. After creation it behaves as any pending card (autosave, approve, reject) but has no grade controls: hand-made cards get no grades. Regenerate never replaces a hand-made pending card.
- **Source container** (later, items 9 and 10): new table `knowledge_sources`-container with name, category and optional link, and a nullable `source_id` on entries. Existing tables and columns are NOT renamed in this run; the physical rename is a separate later step.

## Decisions made

- `processed_at` timestamp instead of overloading `status`: reversible and keeps existing status logic untouched.
- Hand-made items start pending (not approved) so they flow through the same approve, reject and grade path; a hand-made item's feedback rows are not attributed to a model.
- Entry kind vocabulary (excerpt/document) is a wording and docs change in this run; the existing `kind` column values (prose, notion) are not migrated yet.
- One migration for items 1 and 3 (processed_at, origin), one later for the container (items 9, 10).
