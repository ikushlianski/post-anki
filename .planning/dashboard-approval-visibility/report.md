# Dashboard approval visibility

## What shipped

A curriculum sitting in `awaiting_source_approval` is now visible in two higher-level
places, not just the small violet pill on its own subject page.

1. **Dashboard banner** — `SourceApprovalBanner`
   (`apps/web/src/curriculum/source-approval-banner.tsx:5`) renders nothing when no
   curriculum is in that state, otherwise a violet card listing each awaiting course by
   name as a link to `/curriculum/$curriculumId` (where the existing SourceApprovalPanel
   lives). It is wired into the home route at
   `apps/web/src/routes/index.tsx:166`, immediately under the continue-session card so it
   is prominent. Styling mirrors `CourseRefocusBanner`/`StreakBanner`; violet matches the
   existing `awaiting_source_approval` badge color. No backend change — `getBoard()`'s
   `curricula` already carry `status` client-side.

2. **Sidebar count badge** — the "Dashboard" nav link in `apps/web/src/nav/sidebar.tsx`
   shows a violet count pill when 1+ curricula await approval.

## Sidebar count approach

The sidebar is rendered from the root shell (`__root.tsx`), which has no route-loader
data, so a prop-threading approach would have required a root loader that fetches the
whole board once and then goes stale until a full reload. Instead the badge reuses the
app's existing local-first Electric data source (`curriculaCollection` from
`board.collection.ts`), which is the same source the dashboard itself already live-syncs
from.

Because `useLiveQuery` has no `getServerSnapshot` and errors during SSR, the badge is
split into two components: `ApprovalCountBadge` renders null on the server and on first
client render, then mounts `ApprovalCountBadgeLive` after hydration (same `isClient`
pattern `index.tsx` uses for its `LiveDataBridge`). The live count filters
`curriculaCollection` rows for `status === 'awaiting_source_approval'` and hides itself
at zero. This keeps the count reactive — it updates when a course is approved or newly
parsed — with no new global state or query layer.

## What was verified

- `npx tsc --noEmit` — clean, no output.
- `npx vitest run` — 96 files / 495 tests pass, including the new
  `source-approval-banner.test.tsx` (2 tests: renders nothing when empty; lists each
  awaiting course with a link to its approval page).

## Not verified

A type-check and RTL test do not prove this looks right in a real browser. Still to
confirm manually: the banner's visual prominence on the dashboard, and that the sidebar
count actually appears/updates live against Electric sync.
