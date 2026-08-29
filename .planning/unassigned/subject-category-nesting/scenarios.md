---
type: scenarios
branch: learn-from-doc-site
task: "Add a nested category level between Subject and Curriculum, plus new base subjects"
state: confirmed
updated: 2026-08-21
---
# Scenarios: Subject > category > curriculum nesting

## Business Scenarios

SCENARIO 1: Browsing a subject shows its categories and its uncategorized curricula together

Opening a subject's page shows every direct child (a category or a curriculum with no category)
as one clickable list, same as today's flat curriculum list.

What to verify:
- A category renders with a name and how many curricula/sub-categories it holds, same shape as
  the existing subject-count treatment on the dashboard.
- A curriculum with no category still appears directly on the subject page, unchanged from today.
- An empty subject (no categories, no curricula) shows the existing empty-state messaging.

SCENARIO 2: Browsing a category shows its own children and a breadcrumb back to the subject

Opening a category's page (from any depth) shows its child categories and child curricula, and a
breadcrumb trail back through every ancestor category to the owning subject.

What to verify:
- The breadcrumb names every ancestor in order, ending at the subject, regardless of how many
  category levels deep the page is.
- Child curricula and child categories are both clickable, same interaction as the subject page.
- A category with no children shows an empty state, not a broken/blank page.

SCENARIO 3: Adding a new curriculum directly under a subject, no category

From a subject's page, using the single "add" entry point with the tree-position picker left on
its default (the subject itself), creating a curriculum places it directly under the subject,
uncategorized — identical outcome to today's "+ Add curriculum" flow.

What to verify:
- The created curriculum appears on the subject page immediately, with no category.
- The subject's source-requirement rule (sources mandatory vs. the simplified "study a
  technology" flow) is enforced exactly as it is today.

SCENARIO 4: Adding a new category under a subject

From a subject's page, using the same "add" entry point, switching the picker's kind to
"category" creates a new category directly under that subject.

What to verify:
- The new category appears immediately as a clickable child of the subject.
- A duplicate category name under the same parent is allowed (matches this codebase's existing
  no-uniqueness-on-name convention for subjects/curricula) — no error.

SCENARIO 5: Adding a new curriculum from inside a category, position defaults to that category

Opening the "add" entry point from a category's own page pre-selects that category as the target
position, but the tree-position picker still lets the user search and choose anywhere else in the
same subject's tree (another category, a nested sub-category, or the subject root).

What to verify:
- With the picker left on its default, the new curriculum lands under the category being viewed.
- Changing the picker's selection before submitting places the material under the newly chosen
  position instead, not the page's own category.
- The picker only offers positions inside the current subject — it cannot place material into a
  different subject's tree.

SCENARIO 6: A subject that requires sources still enforces that rule inside the unified form

Creating a curriculum via the "add" entry point on a source-requiring subject behaves exactly like
today's `CreateCurriculumForm` — at least one source is mandatory before submission is allowed.

What to verify:
- Submitting with zero sources is blocked, same as today.
- The category-vs-curriculum choice and the tree-position picker both still work normally
  alongside the source fields.

SCENARIO 7: A subject that doesn't require sources still offers the simplified "study a
technology" flow

Creating a curriculum via the "add" entry point on a subject that doesn't require sources uses the
same lightweight single-field flow as today's `StudyTechnologyForm`, not the fuller sources form.

What to verify:
- No source fields are shown; a name is enough to create the curriculum.
- The resulting curriculum still respects whatever tree position the picker had selected.

SCENARIO 8: Moving a curriculum into a different subject's category happens as one action

Moving an existing curriculum (e.g. the Turbopuffer course) from one subject into a specific
category of a different subject (e.g. into the AI subject's RAG category) is a single action that
changes both its subject and its category together — never a state where the curriculum's subject
and category briefly (or permanently) disagree.

What to verify:
- After the move, the curriculum appears under the new subject's chosen category and nowhere else.
- If the move fails partway (target subject or category no longer valid), the curriculum's
  original subject and category are left completely unchanged — no partial move.
- The category picker offered during a move only lists categories that belong to the subject being
  moved into.

SCENARIO 9: Reassigning a curriculum's category without changing its subject

An existing curriculum can be moved into a different category (or back to no category) within the
same subject, without going through a subject change.

What to verify:
- The curriculum's subject stays the same; only its category changes.
- This works the same way whether the curriculum currently has a category or none.

SCENARIO 10: The four new base subjects exist, empty, alongside the existing ones

After seeding, Databases, Architecture, Cloud Computing, and AI all appear on the dashboard as
ordinary subjects with zero curricula, without duplicating or renaming any existing subject.

What to verify:
- Each of the four appears exactly once, with a zero-curricula count until something is added.
- No existing subject (including "Programming / Web Development") is altered by the seed.

SCENARIO 11: The AI subject's RAG category exists after seeding and is ready to receive Turbopuffer

After seeding, the AI subject has one category named RAG, with no curricula in it yet, selectable
from the tree-position picker.

What to verify:
- RAG appears as a direct child of AI on the AI subject's page.
- RAG is one of the selectable positions when creating or moving material into the AI subject.

SCENARIO 12: A category or a move can't cross into a subject it doesn't belong to

Creating a category under a nonexistent subject, or moving a curriculum into a category that
belongs to a different subject than the one it's being moved into, is rejected with a clear error
instead of silently corrupting the tree.

What to verify:
- The error is surfaced to the user, not swallowed.
- Nothing is written to the database on a rejected attempt.

SCENARIO 13: Language-practice subjects are unaffected

A subject configured for language practice (e.g. English, Polish) shows no category UI and no
"add" entry point for categories/curricula — its existing "Open practice" single affordance is
unchanged.

What to verify:
- No category list, breadcrumb, or "add" entry point appears on a language-practice subject's page.
- Nothing about the existing practice flow changes.

## Technical/Architectural Scenarios

None beyond what SCENARIO 8 and 12 already cover (atomicity of the subject+category move, and
rejecting a cross-subject category reference) — both are already written above as business-
observable outcomes, so they aren't duplicated here as a separate technical scenario.
