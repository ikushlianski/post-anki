# Todo: parent-subject-cards

## api-parent-subjects-hold-cards

### Scope
- Server accepts cards on any existing subject, parent or not
- Creating or moving a sub-subject never moves the parent's cards
- Out of scope: AI placement and sub-subject suggestions, covered by their own aspect

### Goal
- Cards can be added to or moved onto any existing subject, and new sub-subjects never move them.

### Criteria
- [x] Adding text, batch or link to a parent succeeds
- [x] Moving cards to a parent succeeds
- [x] First sub-subject leaves the parent's cards in place
- [x] No new Common sub-subject is ever created
- [x] Unknown subject is still refused as not found

### Coding tasks
- [x] Make the subject check for adding and moving cards accept any existing subject
- [x] Stop the add-knowledge and card-move routes from sending the has-sub-subjects refusal
- [x] Remove the move-into-Common step from creating and re-parenting a subject, keeping the parent lock
- [x] Remove the same step from the Business sub-subjects seed script
- [x] Delete the unused Common-creation and leaf-listing helpers once nothing calls them
- [x] Rewrite the parent-subject tests to prove parents accept cards and keep them
- [x] Update the add and move route tests for the removed refusal
- [x] Add roll-up tests showing a parent's own cards in review, counts and browser

### Notes
- Owns apps/api/src/subject/subject-leaf.ts, apps/api/src/subject/subject.repo.ts, apps/api/src/knowledge-source/knowledge-source.controller.ts
- Owns apps/api/src/knowledge-bit/knowledge-bit-move.repo.ts, knowledge-bit-move.controller.ts, apps/api/scripts/seed-business-sub-subjects.ts
- Owns the matching tests: subject-leaf integration, source controller tests, move controller test, review and browser repo tests
- Depends on none

## api-ai-parent-awareness

### Scope
- AI card placement offers topics of courses owned by parent subjects
- AI sub-subject suggestions read the parent's own cards plus a legacy Common child
- Out of scope: The subject checker keeps recommending only subjects without children

### Goal
- AI placement and sub-subject suggestions treat a parent's own cards and courses like any subject's.

### Criteria
- [x] Parent course topics appear in placement choices
- [x] Placement topic cap still holds
- [x] Parent with own cards gets sub-subject suggestions
- [x] Legacy Common cards still feed their parent's suggestions
- [x] Common is never itself split further

### Coding tasks
- [x] Offer topics of courses owned by parent subjects to AI card placement
- [x] Flip the placement test so parent course topics are expected, cap unchanged
- [x] Add a small rule that picks a parent's suggestion pool: itself plus a legacy Common child
- [x] Read suggestion cards and counts across every subject in that pool
- [x] Update suggestion scan tests for parents with own cards and with only Common

### Notes
- Owns apps/api/src/knowledge-bit/knowledge-bit-placement.repo.ts and its integration test
- Owns apps/api/src/subject-suggestion/subject-suggestion-sub-subjects.ts, subject-suggestion-evidence.repo.ts, their tests, a new pool rule file
- Depends on api-parent-subjects-hold-cards

## web-shared-ios-follow-ups

### Scope
- Drop the unused has-sub-subjects refusal from the shared sentences and the web move flow
- Keep the phone and Mac app code as shipped
- Out of scope: Changing the add-knowledge picker default that hides parents behind a checkbox

### Goal
- Clients no longer carry a refusal the server cannot send, while installed apps keep working.

### Criteria
- [x] Shared refusal sentences no longer list has-sub-subjects
- [x] Web move shows only the generic failure message
- [x] Allow-parents checkbox path saves to a parent
- [x] Phone and Mac code and tests are unchanged

### Coding tasks
- [x] Remove the has-sub-subjects sentence from the shared refusal sentences
- [x] Drop the pick-a-sub-subject message from the web card move flow
- [x] Add a web test that picking a parent via the checkbox sends that parent
- [x] Confirm phone and Mac tests still pass with no code change

### Notes
- Owns packages/shared/src/knowledge-source-refusal.ts, apps/web/src/knowledge-bit/use-knowledge-overview-move.ts, apps/web/src/routes/-add-knowledge.test.tsx
- Phone and Mac app code under apps/ios stays as shipped; nothing there is edited
- Depends on api-parent-subjects-hold-cards

## docs-and-verify

### Scope
- Docs describe that any subject can hold cards
- Full checks and a real browser pass on demo data
- Out of scope: Committing or deploying

### Goal
- Docs match the new rule and every check passes on realistic demo data.

### Criteria
- [x] Subject hierarchy doc explains where cards live
- [x] Phone app readme drops the sub-subjects refusal
- [ ] Type checks, lint and tests pass in api, web and shared
- [ ] Browser pass shows a parent's own cards in review and browser

### Coding tasks
- [x] Add a where-cards-live section to the subject hierarchy doc
- [x] Remove the has-sub-subjects refusal from the phone app readme
- [x] Add a legacy Common child with a few cards to the browser demo seed
- [ ] Run type checks, lint and tests in api, web and shared
- [ ] Run a browser pass on demo data: add, move, review and browse a parent

### Notes
- Owns docs/architecture/subject/subject-hierarchy.md, apps/ios/README.md, apps/api/scripts/seed-knowledge-browser-demo.ts
- Depends on api-ai-parent-awareness and web-shared-ios-follow-ups

## Owner questions
- Should the subject checker also recommend parent subjects? Default: no, sub-subjects only
- Should the add-knowledge picker show parents without the checkbox? Default: keep the checkbox
- Should existing Common sub-subjects be folded back into their parents? Default: no

