# Impl report: show each card's source link

## Evidence check
Confirmed: the badge returns null for non-AI cards (ai-label-badge.tsx:28-30), the review payload already carries `sourceLinks`, and the overview item had no source field.

## Files changed
- apps/web/src/knowledge-bit/card-source-link.tsx (new): "Source: host" link using `toSafeLink`, target=_blank, rel="noopener noreferrer"; renders nothing for missing or non-http(s) addresses.
- apps/web/src/knowledge-bit/anki-review-card.tsx: shows the link after reveal.
- apps/web/src/knowledge-bit/knowledge-overview-table.tsx: link in the answer cell of each row.
- packages/shared/src/knowledge-bit-overview.ts: `sourceLinks` added to the overview item (`default([])`).
- apps/api/src/knowledge-bit/knowledge-bit-overview.repo.ts: selects and returns `sourceLinks`.
- apps/web/src/mocks/knowledge-overview.mock.ts, anki-review-card.test.tsx, knowledge-overview-table.test.tsx: mock field and new tests.

## Behavior
A card with a safe source link shows "Source: host" under the revealed answer in review and in its All cards row, AI-labelled or not. Unsafe (javascript:, data:) or missing addresses show nothing.

## Tests
- apps/web: `npx vitest run src/knowledge-bit/anki-review-card.test.tsx src/knowledge-bit/knowledge-overview-table.test.tsx src/knowledge-bit/ai-label-badge.test.tsx src/routes/-knowledge.index.test.tsx` -> 4 files, 36 passed, 0 failed.
- apps/api: `npx vitest run src/knowledge-bit/knowledge-bit-overview` -> 6 passed.
- packages/shared: `npx vitest run` -> 76 passed.

## tsc
`npx tsc --noEmit` clean in apps/web, apps/api and packages/shared.

## Defaults chosen
- AI-labelled cards keep their existing badge links (visible before reveal); the new link is skipped for them after reveal to avoid a duplicate. Only the first safe link is shown per card in the new link.
- `sourceLinks` defaults to `[]` in the overview schema so older responses still parse.

## Undone
- The DB-backed overview integration test was not run or extended (needs the database); the repo change is a plain column select.
- Did not touch the forbidden folders or anki-review-session-actions.ts.

## Citation
apps/web/src/knowledge-bit/anki-review-card.tsx (`{!card.isAiGenerated && <CardSourceLink ...`) and apps/web/src/knowledge-bit/knowledge-overview-table.tsx (`<CardSourceLink sourceLinks={row.sourceLinks}`)

END-OF-REPORT
