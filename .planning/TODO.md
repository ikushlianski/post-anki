---
type: todo
branch: main
task: post-anki open items
state: open
updated: 2026-08-14
---
# Run todo

Business and architecture-level open items only. Small mechanical gaps get fixed directly.

## Wishlist for the night

- [ ] Simplify the dashboard to show only the courses I actually started — STUCK, needs a human
      look. The home page is proven never to invent courses from taxonomy data; the separate
      dashboard page still has no such guarantee. Work sits on branch
      dashboard-self-initiated-only.
- [x] One easy-to-manage dashboard tree of subjects, courses, modules and topics. Built and
      verified on branch dashboard-unified-tree, NOT yet merged — the live app still shows the
      old separate dashboard page.
- [ ] Drag a course card onto a different subject to move it there. The dropdown alternative
      works; the drag itself fails intermittently under independent review and needs a human
      watching a real browser to finish diagnosing.
- [ ] Make it easy to add sources to a course — STUCK, needs a human look. The paste-a-docs-link
      flow works, but review found a second place elsewhere that fetches a user-supplied address
      without the same protection, plus no test coverage for the new discovery step. Work sits on
      branch curriculum-add-sources-easily.
- [ ] Let a module or topic suggest its own children from web search — STUCK, needs a human look.
      Built and verified; blocked on citation links rendering without a safe-address check, a
      weakness that already exists in four other places. Work sits on branch
      module-topic-expand-web-search.
- [ ] Let me chat with the structure of my knowledge — move things, merge them, reorganise.
- [ ] Fix waitForHydration to wait for real hydration, not router presence.
- [ ] Update two locked e2e tests for curriculum structure-shaping pipeline stage.
- [ ] Add subject/tag split fast-follow to ontology-split-merge; include cycle guard.
- [ ] Connect post-anki to the-me-agent vault via MCP for mentor context.
- [ ] Recommend courses from the-me-agent's learning map, with accept/later/dismiss.
- [ ] Add one daily Telegram touchpoint digesting all practice surfaces.
- [ ] Merge Tauri desktop app worktree once Rust toolchain is installed.
      [→ .claude/worktrees/tauri-desktop-app]

## Decisions to make

- [x] Merge the courses home page and the dashboard into one, using the dashboard's design.
      Implemented; drag-and-drop between subjects is not yet reliable and is tracked separately.
- [ ] Register the drag-and-drop library in the shared tech-stack registry, which lives in
      another repository this run deliberately did not touch.
- [ ] Turn on live-updating sync in production, or remove it entirely. It was deployed once and
      has never passed a health check since, so it currently serves no traffic. Check real
      billing before assuming it costs nothing.
- [ ] Splitting a subject, course or tag into pieces needs product design first: how does the app
      decide which existing content goes where?
- [ ] When discovering doc-site sources for an existing course, should candidates be saved
      immediately and go through the same approval flow as new courses, or be reviewed in the
      browser and submitted only once accepted? Currently the reversible second option. Revisit
      if it feels wrong in practice.

## To review / clarify

- [ ] Review suggestions for the knowledge map can come back empty with no error — it just looks
      like nothing happened.
- [ ] Adding more source material to a course can silently delete modules merged in from another
      course, with no warning.
- [ ] Retrying research on a course that absorbed another can delete the absorbed course's
      original source links.
- [ ] A manual scan for new docs can return nothing while a scheduled scan runs for a different
      subject, because scans are serialised across the whole app instead of per subject.
- [ ] The mobile app has two narrow address-safety gaps around local development and non-secure
      connection types. Low real-world risk, not yet hardened.

## Manual steps

- [ ] Wire the API's database-backed test suite into the build pipeline.
- [ ] If live sync goes to production: set its database secret, then turn on the feature switch.
- [ ] The cloud development database is missing recent updates, so the board fails to load
      against it. Needs someone with access to apply them.
- [ ] Three database updates from the concurrency work exist only locally, not in the cloud.
- [ ] Uncommitted fixes sitting in the separate end-to-end test repo need reviewing and either
      committing or discarding by hand.
- [ ] A repeated-click workaround in the tag-picker end-to-end test can probably be simplified now
      that the underlying timing bug is fixed.
- [ ] Confirm Playwright gotcha notes got committed in verification-repo (outside this repo's
      autonomy).

## Post-deploy checks

- [ ] Once live sync is running: confirm a long-lived connection is not cut short by a timeout.
- [ ] Once live sync is running: confirm an unauthorised data request is rejected against the real
      production address, not just locally.

## Resolved

- 2026-08-05 — TODO.md wrongly implied an unmerged branch was live; corrected.
- 2026-08-05 — Tests polluted the live local database with fixtures; they now run against an
  isolated throwaway database.
- 2026-08-05 — Courses could only be reorganised by deleting and recreating them; added a proper
  move-to-another-subject action.
- 2026-08-05 — A stale tracking bug permanently hid one database update locally, breaking
  duplicate-subject detection.
- 2026-08-01 — Concurrent phrase-bank generate and grade calls could deadlock.
- 2026-08-01 — A knowledge-map review with zero suggestions silently looked like nothing happened;
  now fails loudly.
- 2026-08-01 — Creating a course during a concurrent subject merge could orphan it.
- 2026-08-01 — Tag assignments needed a manual page reload to appear.
- 2026-08-01 — A server-only import could silently break the web app in production; the build now
  catches it.
- 2026-08-01 — Double-clicking accept or reject on a doc-scan suggestion could create a duplicate
  knowledge-map entry.
- 2026-08-01 — Merging two subjects left the losing subject's pending suggestions stuck and
  invisible forever; they now carry over.
- 2026-08-01 — Deleting a subject during a concurrent merge could destroy or orphan courses.
- 2026-08-01 — Deleting a subject could hang the app under load by holding two database
  connections per delete; now uses one.
- 2026-08-01 — An exhausted connection pool could hang forever with no error; now fails loudly.
- 2026-08-01 — Four database-backed tests were silently not running in either configuration.
- 2026-08-01 — Investigated a flaky course-merge test; traced to a known rendering timing issue,
  not a new bug.
- 2026-08-01 — Confirmed a real timing gap where controls far down a page look clickable before
  the app has attached their handlers.
