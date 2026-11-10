# Parent subjects stay out of the add-knowledge picker by default (2026-10-11)

Items: 'Keep parent subjects out of the add-knowledge picker unless asked for' and 'Open a parent subject's children when its row is clicked'. Web only, no API or migration change, nothing committed.

## What changed

- `apps/web/src/knowledge-source/use-knowledge-subject-choice.ts` (new): the picker options exclude every subject that has children unless `allowParents` is on; a preselected parent id is ignored; the opened parent's own leaf sub-subjects are listed first; an untouched picker falls back to a preselected leaf, a touched one keeps the learner's choice (so it can be cleared); ticking the checkbox later never selects the ignored parent.
- `apps/web/src/knowledge-source/add-knowledge-form.tsx`: uses the hook; adds the quiet checkbox 'Also allow parent subjects' (default off, not remembered, 44px tap area on phones) and the hint 'Pick a sub-subject of <Parent>'. The 'Back to <subject>' link still works for a preselected parent.
- `apps/web/src/dashboard/dashboard-subject-list.tsx`: for a parent row the name is a button (`aria-expanded`, `aria-controls`) that toggles its children; leaf rows keep the link; the row body is one shared fragment. The ⋯ menu 'Open' item still opens the parent's own page.
- Entry points: the 'Add knowledge' link on the subject page already passes the subject id; for a parent the form now shows the hint instead of preselecting it, so no change was needed there. The sidebar and the empty-state links open the form without a subject.
- The API stays permissive: any existing subject id is accepted.
- `docs/architecture/subject/subject-hierarchy.md`: new section 'Knowledge goes to leaf subjects by default'.

## Tests

- `apps/web/src/routes/-add-knowledge.test.tsx`: parents hidden by default, the checkbox reveals them, a preselected parent is ignored with the hint, the parent's leaves come first, ticking the checkbox does not select the ignored parent, a leaf shows no hint; the old 'change the preselected subject' test now ticks the checkbox before choosing 'Business'.
- `apps/web/src/dashboard/dashboard-subject-list.test.tsx`: the parent name is a button that toggles children and collapses again, a subject without children is still a link, the menu 'Open' item links to the subject page; the row lookup helper uses the `subject-name` test id instead of the link role.

## Real browser check (Playwright, headless, http://localhost:5540, no data written)

```
suggestions by default (16): parents excluded: true, has Business › Sales: true
after checkbox (18): has Business: true, has Programming: true
Business name element is a BUTTON, aria-expanded=false
after click: url unchanged=true, aria-expanded=true, children rows visible: 6
leaf Sales name element is a A
second click collapses: aria-expanded=false
menu Open href: /subject/sub_...
opened with parent id: picker value="", hint="Pick a sub-subject of Business"
first suggestions: ["Business › HR","Business › Marketing","Business › Negotiations"]
```

## Verification (real output)

- `npx tsc --noEmit` in apps/web: exit 0.
- `npx vitest run` in apps/web: Test Files 175 passed (175), Tests 1163 passed (1163).
- `node scripts/phone-layout-check.mjs --seed`: PASS: phone, chat overlap and desktop sections verified. Its first run failed on the new checkbox (18 px hit area); fixed with `min-h-[44px] sm:min-h-0` on the label. The seeded data was removed (0 sources, 0 feedback rows).

## Notes

- A formatter run without the project's options briefly rewrote `dashboard-subject-list.tsx` in another style (semicolons, double quotes); it was reformatted with the project's style (no semicolons, single quotes, width 100) and the diff was checked. Two small prettier reflows remain in that file (the empty-state div and the `SubjectSiblingGroup` props).

## Left open

- Search results (global search, dashboard subject search) still link straight to a subject's page, because the learner picked it explicitly there.
- Subject-page links to sub-subjects are unchanged.

END-OF-REPORT
