---
type: architecture
direction: prose-knowledge-fisher
task: "Knowledge-item approval gate"
---

# Architecture: approval as a column, not a side table

## Why a column, not a parallel "pending_bits" table
`knowledgeBits` already carries every other lifecycle flag as a column on the same row
(`embeddedAt`, `taggedAt`, `placementCheckedAt`, ...). A separate approval table would mean every
learner-facing query needs an extra join to find out if a row it already has permission to join on
is actually visible — strictly more surface area for the same guarantee. One `approvalState` enum
column keeps the existing join shape; only the predicate changes.

## Why generation keeps running for pending bits
The review screen's whole value is showing the learner what the AI would ask, before they decide.
Blocking generation until approval would mean approving blind (just the source prose, no Q&A) —
exactly the opposite of what the user asked for ("a list of... question and answer... approve,
reject, edit"). The cost control that matters is stopping *rejected* bits from consuming further
generation budget, not pending ones.

## Why edits to a variant supersede instead of mutating
`listNextQuestionVariantsToAnswer` already treats a variant as dead once `supersededBy`/equivalent
is set (same mechanism the wh-question/fill-blank regeneration paths use). Reusing it for an edit
means the approval gate introduces zero new variant-lifecycle concept — an edited variant is
indistinguishable, to every downstream reader, from a regenerated one.

## Why the bit's own body/background text is a plain in-place update
A pending bit has, by definition, never been answerable — `listNextQuestionVariantsToAnswer`
excludes it. There is no attempt history that could go stale against an edited body, so there's
nothing superseding would protect. Once a bit is approved, its body is not editable through this
screen (out of scope) — only pre-approval edits exist, where in-place is safe.

## Why existing bits default to pending (not a backfill to approved)
See `spec.md`'s "Decision made autonomously." Architecturally this is also the simpler migration:
a single `DEFAULT 'pending' NOT NULL` column add covers both new and existing rows identically,
with zero backfill UPDATE statement to get wrong.

## Blast radius: why this is Guarded
Adding a column via migration is this repo's own definition of schema-sensitive — triggers Guarded
tier regardless of the feature's own complexity. The practical consequence: two full independent
review-factory passes, the second with Opus as the structured-verdict model (not Sonnet), given how
easy it is for one of the 6+ learner-facing read sites to be missed and ship a silent bypass.
