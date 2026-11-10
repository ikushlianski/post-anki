## Wire per-topic due count into curriculum topic list view

### Changes made

1. `packages/shared/src/topic.ts` — added `dueCount: z.number().int().optional()` to `topicSchema` after `headroomOfferedAt`.
2. `apps/api/src/curriculum/curriculum.repo.ts` — imported `getDueCountsForTopics`; added it as 4th element in the `Promise.all`; added `dueCountByTopicId` parameter to `buildModules`; populated `dueCount` on each topic object.
3. `apps/web/src/curriculum/model.ts` — added `dueCount: z.number().int().optional()` to `topicSchema`.
4. `apps/web/src/curriculum/api-client.ts` — forwarded `dueCount` in `mapTopic`.
5. `apps/web/src/curriculum/topic-row.tsx` — rendered `{N} due` badge in amber when `dueCount > 0`.

### Check results

- `npx tsc --noEmit` (apps/api): pre-existing errors only (model-comparison module), none introduced.
- `npx tsc --noEmit` (apps/web): pre-existing errors only (model-comparison, storybook), none introduced.
- `npx vitest run apps/api/src/curriculum/`: 214 tests pass; 10 integration tests fail with ECONNREFUSED (no DB at 5578) — pre-existing, not caused by this change.

### Default taken

Added `dueCount ?? 0` default in `buildModules` (matches the existing pattern used for `dueCountByModuleId`).

END-OF-REPORT
