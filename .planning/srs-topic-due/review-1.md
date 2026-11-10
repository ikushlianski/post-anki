## Review — Wire per-topic due count into curriculum topic list view

### Checklist verification

1. `dueCount: z.number().int().optional()` in shared topicSchema
   - packages/shared/src/topic.ts:52 — CONFIRMED, added after `headroomOfferedAt`
   - apps/web/src/curriculum/model.ts:299 — CONFIRMED

2. `getDueCountsForTopics` imported and called in Promise.all alongside `getDueCountsForModules`
   - apps/api/src/curriculum/curriculum.repo.ts:65 — import confirmed
   - apps/api/src/curriculum/curriculum.repo.ts:2251–2255 — 4th element of Promise.all confirmed

3. `dueCount` populated on each topic in `buildModules`
   - apps/api/src/curriculum/curriculum.repo.ts:2530 — `dueCount: dueCountByTopicId.get(t.id) ?? 0` confirmed; default `?? 0` matches existing module pattern

4. `mapTopic` in api-client.ts forwards `dueCount`
   - apps/web/src/curriculum/api-client.ts:256 — `dueCount: topic.dueCount` confirmed

5. topic-row.tsx shows amber "{N} due" badge when dueCount > 0
   - apps/web/src/curriculum/topic-row.tsx:158 — confirmed; amber class `text-amber-600`, guarded by `topic.dueCount && topic.dueCount > 0`

### Type check

- apps/api `npx tsc --noEmit`: errors in src/model-comparison/* only — pre-existing, none in changed files
- apps/web `npx tsc --noEmit`: errors in src/model-comparison/*, storybook, knowledge-bit-review — pre-existing, none in changed files

### Performance and security

No critical or high severity issues found. The `getDueCountsForTopics` call is batched (one query for all topic IDs) inside a Promise.all, not in a loop. No new endpoints or authorization surfaces introduced.

### Business feature

ELEMENT: "N due" badge on a topic row
Possible values:
  absent: dueCount is 0 or undefined — no badge rendered
  "N due": one or more SRS cards are currently scheduled for review on this topic
How it's calculated: the backend queries the SRS scheduling table for all topics in the curriculum in one batch call, counts due cards per topic ID, and passes the count through to the frontend alongside the rest of the topic shape.
Edge cases: topics with no SRS history show no badge; dueCount 0 is treated the same as absent (badge hidden).

### Verdict

state: approved
Blocking issues: None
Divergences from plan: None

END-OF-REPORT
