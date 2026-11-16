# Research: Is Shuffle a per-session user toggle on the Today screen, a new global admin setting, or a replacement for the existing mixNewWithDue setting? The ticket does not say where the option lives.

## Facts
- Fact: mixNewWithDue is an existing global admin setting, validated as a required boolean in the shared admin-settings schema and optional in the update schema. (source: packages/shared/src/admin-settings.ts:55)
- Fact: The web admin-settings page has a toggle for mixNewWithDue, and the iOS admin-settings screen also exposes it. (source: apps/web/src/routes/admin-settings.tsx:169)
- Fact: Per the earlier research note, mixNewWithDue is stored in the mix_new_with_due column (boolean, not null, default true). When it is false the queue returns due cards followed by new cards. When it is true the queue alternates seen and new cards deterministically, not randomly. (source: .planning/a-shuffle-option-for-today-s-review-mixe/research.md:9)
- Fact: Scoped review queues (tag, topic, bit, subject) read the same mixNewWithDue flag. Nothing in the schema or the other code I searched implements shuffle or random ordering for the review queue. (source: .planning/sub-subjects/plan-parent-review-mix.md:9)
- Fact: The ticket text appears in TODO.md only as a one-line item that says a session is not always new cards first. It does not state where the option lives, and it does not say whether Shuffle replaces mixNewWithDue. (source: .planning/TODO.md:1148)

## Open questions
- Open question: Where does Shuffle live: a per-session toggle on the Today screen, a new global admin setting, or a replacement for mixNewWithDue? Nothing I read decides this. It determines whether the work touches the Today screen UI, the admin-settings schema, DB column and API, or the existing mix behaviour.
- Open question: If Shuffle is added alongside mixNewWithDue, which takes precedence when both apply, and does shuffle apply to scoped queues as well as the unscoped Today queue?
