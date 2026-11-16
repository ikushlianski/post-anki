# Research: Does 'random order' mean a full random permutation of the combined new and due cards, or randomness only in how new and due are interleaved? The current interleave is deterministic alternation.

## Facts
- Fact: The current mix is `interleaveNewWithSeen(seen, fresh, limit)`. It alternates one seen (due) card and one new card until the limit is reached or both lists run out. It has no randomness. (source: apps/api/src/knowledge-bit/knowledge-bit-review-queue-mix.ts:1)
- Fact: The interleave is controlled by the admin setting `mixNewWithDue`. That setting is a boolean on/off switch, and the shuffle option would be a separate choice from it. (source: apps/api/src/admin-settings/admin-settings.repo.ts:85)
- Fact: An earlier plan describes the scoped review path. Cards come ordered by reviewCount ascending, then createdAt. With `mixNewWithDue` on, seen and new cards are interleaved via `interleaveNewWithSeen`. (source: .planning/sub-subjects/plan-parent-review-mix.md:9)
- Fact: Grepping `apps/api/src/knowledge-bit` for shuffle or random found only `randomUUID` in test ids. No existing shuffle or random-order logic is in the review queue code. (source: apps/api/src/knowledge-bit/knowledge-bit-review-queue-mix.ts)

## Open questions
- Open question: Should "random order" be a full random permutation of the combined new and due cards, or should it only randomise how new and due are interleaved? The existing interleave is deterministic alternation, and no code or doc settles this. A full permutation would drop the alternating pattern and could put many new cards in a row. Randomised interleaving would keep each pool's internal order, for example due cards most overdue first.
