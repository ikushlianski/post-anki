# Subject-dependent ingestion with optional custom instructions and examples

Goal
- Each subject can carry optional free-text extraction instructions and optional example cards; when knowledge for that subject is ingested, both are added to the extraction prompt. Subjects without them behave as today.

What already exists (do not rebuild)
- Subject kind picks the prompt: `apps/api/src/subject/subject-kind.ts` (business / language / other) → `apps/api/src/mastra/knowledge-bit-business-cards.prompt.ts` etc.
- Per-subject inputs already fed to extraction in `apps/api/src/knowledge-bit/detect-knowledge-bits.orchestrator.ts:166-193`: card style notes (`styleNotesBlock`, distilled from triage, table `card_style_notes`), `learningIntent`, `detailLevel` (columns on `subjects`, `apps/api/src/db/schema.ts:32-63`).
- Web subject settings: `apps/web/src/subject/subject-learning-intent-form.tsx`, `apps/web/src/subject-study-options/subject-study-options-form.tsx`.

Scope
- In: two nullable subject fields (instructions text, examples list of front/back[/example]) with length caps; API read/update via the existing subject update path; web form fields next to learning intent; both injected into every extraction agent path (business, language, other, fill-blank/basic-card where the subject applies) as clearly delimited, lower-priority-than-rules blocks.
- Sub-subjects inherit from the nearest parent that sets them.
- Out: native app editing (web only first), changing the base prompts, re-extracting old sources.

Constraints
- User text is untrusted prompt input: delimit it, cap size, never let it override output schema rules.
- Generate the Drizzle migration and run it with the existing migrate script.

Done when
- Unit tests show the blocks present in the prompt when set, absent when unset, inherited from a parent; `npx tsc --noEmit` clean; local extraction of a sample note in a subject with instructions follows them.

Assumptions
- "Depend on the subject" is already true via subject kind; the new part is user-set instructions and examples.
- Examples are a few sample cards, not whole notes.
