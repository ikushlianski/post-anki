# Phone-width overflow fix — impl report 1

## Screens scanned

1. `apps/web/src/routes/add-knowledge.tsx` and `apps/web/src/knowledge-source/add-knowledge-form.tsx`
2. `apps/web/src/knowledge-bit/knowledge-bit-review-page.tsx` and its children
3. `apps/web/src/routes/knowledge.review.tsx` → `anki-review-screen.tsx`, grade controls
4. `apps/web/src/nav/sidebar.tsx`

## Findings

**Screen 1 — add-knowledge form: two overflows found and fixed.**

- Action buttons row (`<div className="flex items-center gap-3">` at line 269): "Add another block" (~134px) + "Add knowledge" (~127px) + gap (12px) = ~273px on a 280px content area at 320px viewport. Overflow on the smallest phones. Fixed with `flex-wrap`.
- Success message row (`<div className="flex items-center gap-3 text-sm">` at line 291): long status paragraph + up to two links in a non-wrapping flex row — certain overflow. Fixed with `flex-wrap`.

**Screen 2 — approval screen (knowledge-bit-review-page and panel):** No overflow. The source group uses `flex flex-wrap` already; the bit grid is `grid-cols-1` on mobile; the approve/reject buttons use `flex-col` on mobile.

**Screen 3 — review page and grade controls:** No overflow. The review screen header fits at 320px (min-content of each side totals ~216px). The grade buttons grid is `grid-cols-4` — at 320px each column is ~64px with short labels ("Good", "Easy" etc.) at 14px. The session bar already uses `flex-wrap`.

**Screen 4 — sidebar:** No overflow. Nav uses `flex flex-col`; the mobile drawer is `w-64` drawn over content, not contributing to layout width.

## Changes made

File: `apps/web/src/knowledge-source/add-knowledge-form.tsx`
- Line 269: added `flex-wrap` to the action buttons container
- Line 291: added `flex-wrap` to the success message/links container

No other files changed.

## Checks

Diff command: `git diff HEAD -- . ':(exclude).planning/.nextx-ie/'`

`npx tsc --noEmit` in `apps/web`: pre-existing errors in `model-comparison.api.ts`, storybook files, and an unrelated `-knowledge-bit-review.test.tsx` import — none in changed files and all confirmed pre-existing.

`npx vitest run apps/web/src/routes/-add-knowledge.test.tsx`: 2 failed | 34 passed. The 2 failures are pre-existing (confirmed by running the same file before applying changes — identical failure count and location at line 752, unrelated to CSS classes).

No lint script found in `apps/web/package.json` or root `package.json` (only `depcruise` and custom check scripts).

## Visual testing note

Visual browser screenshots are needed separately. They require the e2e stack at :5550 and are a manual step — automated checks cannot substitute for viewport-resize testing at 320px and 375px.

END-OF-REPORT
