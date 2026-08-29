---
type: todo
branch: learn-from-doc-site
task: "Add a nested category level between Subject and Curriculum, plus new base subjects"
state: open
updated: 2026-08-21
---
# Todo: Subject > category > curriculum nesting

## Decisions to make
Nothing to decide — autonomous planning session, all forks resolved and logged in spec.md.

## To review / clarify
Nothing open — the concurrent-move test's claim was corrected this pass (see Resolved).

## Coding tasks
- [ ] Write frontend tests for create-material-form, category-tree-picker, category route.

## Manual steps
- [ ] Push the branch when ready (not done by this pass, per instruction).

## Post-deploy checks
No post-deploy checks needed.

## Resolved
- [x] Verified locally: typecheck, unit and integration tests, live HTTP checks pass.
- [x] Fixed drag-reorder regression: reorderCurricula now scopes id-set to uncategorized curricula.
- [x] Category page's move control now reaches other subjects' categories on cross-subject moves.
- [x] Concurrent-move test now asserts the real no-leftover-lock property, not a trivial one.
- [x] SCENARIO 9 UI: move control offers own subject; category page rows match.
- [x] create-material-form.tsx: added error handling and button re-enable on submit failures.
- [x] Fixed moveCurriculumToSubject lock-selection race with a re-read-and-retry lock strategy.
- [x] Wrote subject-category integration tests covering categories, moves, and concurrency.
- [x] Fixed getBoard() N+1 with a new flat subject-categories endpoint.
- [x] SCENARIO 7: extracted shared simplified-technology fields, restored explainer text.
- [x] Category-count copy now matches dashboard's zero-state and item-count pattern.
- [x] Removed dead StudyTechnologyForm and getCategory; listAllCategories is no longer dead.
- [x] Added validateCategoryBelongsToSubject deriver via TDD.
- [x] Added resolveCategoryPath deriver via TDD.
- [x] Added buildCategoryPickerOptions deriver via TDD.
- [x] Added subject_categories table and curricula.category_id column via migration.
- [x] Built subject-category repo, controller, and route registration.
- [x] Extended curriculum repo/controller for categoryId on create and move.
- [x] Seeded four new base subjects: Databases, Architecture, Cloud Computing, AI.
- [x] Seeded AI > RAG and Web Theory starter categories.
- [x] Built category-tree-picker and create-material-form components.
- [x] subject-section.tsx: added category list, single add-entry point, extended move.
- [x] Added the category detail route with breadcrumb and children.
- [x] subject.$subjectId.tsx loader now passes categories through.
- [x] Wrote architecture.md for subject-category-nesting.
