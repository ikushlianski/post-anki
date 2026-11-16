# Research

## Facts
- Fact: The ticket is a pending, unchecked TODO item: 'A Shuffle option for today's review mixes new and due cards in random order, so a session is not always new cards first.' It has priority medium and an empty 'Coding tasks' section. (source: .planning/TODO.md:1148)
- Fact: The ticket's own TODO section (priority medium, no coding tasks yet) is tied to goal run run-20261116t231447z. (source: .planning/TODO.md:1858)
- Fact: The review queue is built by getKnowledgeBitReviewQueue. In the unscoped path, when the mixNewWithDue setting is false, it returns due cards followed by new cards. (source: apps/api/src/knowledge-bit/knowledge-bit-review-queue.repo.ts:217)
- Fact: When mixNewWithDue is true, the queue uses interleaveNewWithSeen. This alternates one seen/due card with one new card, in order. It is deterministic, not random. (source: apps/api/src/knowledge-bit/knowledge-bit-review-queue-mix.ts:1)
- Fact: Scoped queues (tag, topic, bit or subject) use the same mixNewWithDue flag through listScopedBatch. Subject-only scopes may instead use listParentMixCards. (source: apps/api/src/knowledge-bit/knowledge-bit-review-queue.repo.ts:100)
- Fact: mixNewWithDue is a global admin setting. The column is mix_new_with_due, a boolean that is not null and defaults to true. The API reads it with getMixNewWithDue and updates it through updateAdminSettings. (source: apps/api/src/db/schema.ts:588)
- Fact: The web admin-settings page already has a toggle for mixNewWithDue. (source: apps/web/src/routes/admin-settings.tsx:169)
- Fact: The review controller sends the queue's cards to the client grouped by subject, via groupReviewCardsBySubject. Any shuffle therefore has to be reconciled with the grouping and with the planned 'Today groups cards by subject' item. (source: apps/api/src/knowledge-bit/knowledge-bit-review.controller.ts:42)
- Fact: A neighbouring TODO item says the Today button groups today's cards by subject and announces the next subject. It overlaps with shuffle ordering. (source: .planning/TODO.md:1147)
- Fact: Any work in the mobile app must first follow the rule to read the versioned Expo v57.0.0 docs. (source: apps/mobile/AGENTS.md:3)
- Fact: No wayfinder wiki pages exist under .planning, and no shuffle-specific code exists in the app source. The only 'shuffle' hits in the api schema are an unrelated comment about learning-path reordering. (source: apps/api/src/db/schema.ts:2143)

## Open questions
- Open question: Is Shuffle a per-session user toggle on the Today screen, a new global admin setting, or a replacement for the existing mixNewWithDue setting? The ticket does not say where the option lives.
- Open question: Does 'random order' mean a full random permutation of the combined new and due cards, or randomness only in how new and due are interleaved? The current interleave is deterministic alternation.
- Open question: Which clients does Shuffle cover: web, mobile or both? Mobile requires reading the Expo v57 docs first.
- Open question: Should the shuffle respect subject grouping, the daily new-card cap and the review cap? Those caps are applied before the final ordering.
- Open question: Should the shuffle order be stable within a session, for example seeded per day, or re-randomised on every queue fetch?
