# Pick, change or create a subject during triage (web, Mac, iPhone)

## Goal
While triaging a pending knowledge item on any device, the user sees the item's current subject, can change it to any
existing subject or subsubject, and can create a new subject, or a subsubject under an existing one, right there,
then assign it, without leaving triage.

## Known facts
- Subjects are a tree (`subjects.parent_id`; `POST /subjects` creates; `PATCH /subjects/:id` updates) in apps/api/src/subject.
- Triage views: Mac/iPhone `apps/ios/Sources/Shared/pending-review-triage-view.swift` (+ focus triage list files in
  Sources/Shared), web pending-review / triage route in apps/web/src (find it).
- Find whether an endpoint already moves a knowledge bit (or its source) to another subject. Reuse it if so;
  otherwise add a minimal one following router-table patterns, with tests. Decide whether the subject lives on the bit
  or on its knowledge source and change the right one, keeping other bits of the same source untouched unless that is
  the existing rule.

## Approach
- Reuse existing subject pickers/creation forms (web subject creation UI, iOS subject lists) rather than new ones.
- One shared picker per platform: search/list subjects as a tree, a "New subject" action with an optional parent.
- After a change, the triage item shows the new subject immediately.

## Out of scope
Subject merge, reorder, delete; bulk reassignment; subject guidance editing.

## Done when
- API unit tests touched pass, tsc clean in api/web/shared.
- Web vitest for the touched files passes (`npx vitest run <files> --maxWorkers=2`).
- `apps/ios/scripts/run-mac.sh --test` passes; generic iOS simulator build of PostAnkiIOS succeeds.
