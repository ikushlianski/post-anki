---
type: scenarios
task: prose-knowledge-fisher--tag-cap-guard-cleanup
updated: 2026-09-24
---

# Scenarios

- [ ] A real unique-violation race on `resolveOrCreateTag`, triggered while called from inside
      `resolveTagUnderCapGuard`'s held transaction, recovers by returning the raced row instead of
      throwing
- [ ] A real unique-violation race on `resolveOrCreateTag`, called directly against the pool
      (outside any guard transaction), still recovers exactly as before — the fix doesn't regress
      the existing unlocked call path
- [ ] A thrown error from the forced tag matcher still falls through to `freshTags[0]`, the same as
      a matcher that returns a non-member name
- [ ] `tag.repo.ts` is at or under 300 lines, and every module that imports
      `resolveTagUnderCapGuard`/`MatchClosestTagFn` still compiles against the new file
