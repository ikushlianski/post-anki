# Subject hierarchy UX review

Read-only review of the sub-subject features. Items marked UNVERIFIED need a real browser (desktop and phone width) before they are treated as confirmed. Each issue is tagged Fact (read from code) or Assumption (inferred, needs a browser check).

## Verdict

1. The core pattern works: nested cards, a ⋯ menu per row, keyboard drag on the dashboard, and search that shows the full path of each result.
2. The main risk is deleting. The confirm step says only "Delete X?", but the server deletes that subject's own curricula and leaves its sub-subjects behind, where they silently move to the top level.
3. Discoverability and reach are weak for reordering: the grip is faint with no hint, the subject page drags have no keyboard path, and its handles lack touch-action settings.
4. Add sub-subject and Move under give no visible result (the new or moved item can land inside a collapsed parent), and focus is lost after several menu steps, which breaks Escape.
5. Phone width and deep nesting look cramped on paper but are UNVERIFIED in a browser.

## Dashboard (routes/index.tsx, dashboard/*)

**D1. Delete warning omits curricula and sub-subjects (High, Fact).**
- User sees: "Delete Biology?" with Cancel and Delete. Nothing about what goes with it.
- Why it hurts: the server deletes every curriculum the subject owns, then leaves child subjects in place with a dangling parent. Those children jump to the top level with no explanation.
- Fix: count the owned curricula and sub-subjects (already in the client data) and state the result in the confirm text.
- Refs: `apps/web/src/dashboard/subject-row-menu.tsx:343`; `apps/api/src/subject/subject.repo.ts:450-459` (curricula deleted, children not touched); `apps/web/src/dashboard/dashboard-subject-list.tsx:27-29` and `:58-62` (orphans shown at top level); `apps/api/src/db/schema.ts:46` (no foreign key on parent).

**D2. Drag to reorder is hard to find (High, Fact; touch UNVERIFIED).**
- User sees: a small grey grip (about 2.5:1 contrast on white for neutral-400) at the left of each row. The page header describes status changes only and never mentions reordering or nesting.
- Why it hurts: nobody learns the grip is draggable, and the 32px-wide target is small for a phone finger. Touch should work because the handle has `touch-none`, but that needs a device check.
- Fix: add a one-line "Drag rows to reorder" hint under the header and use a larger, darker grip.
- Refs: `apps/web/src/dashboard/dashboard-subject-list.tsx:178-187`; `apps/web/src/dashboard/dashboard-view.tsx:76-79`.

**D3. Add sub-subject and Move under give no visible result (High, Fact for the code; visible effect Assumption).**
- User sees: the menu closes and the trigger regains focus. If the parent was collapsed, the new child is hidden, and the only sign is the parent's count changing. A moved subject disappears from its old spot and may reappear in a collapsed branch.
- Why it hurts: the user cannot tell whether the action worked, and the object they just made or moved is out of view.
- Fix: expand the target parent after either action and briefly highlight the affected row.
- Refs: `apps/web/src/routes/index.tsx:83-101` (no expand call); `apps/web/src/dashboard/dashboard-subject-list.tsx:166` (expansion check); `apps/web/src/dashboard/subject-row-menu.tsx:109-110` and `:130-131` (close only).

**D4. Focus is lost after menu view changes, so Escape stops working (High, Fact for the code; browser UNVERIFIED).**
- User sees: after tapping Delete subject or Move under…, the clicked item unmounts and focus drops to the page body. A keyboard user who presses Escape gets nothing and has to tab from the top of the page.
- Why it hurts: the Escape handler sits on the menu's root element, and keys pressed while focus is on the body never reach it. The focus effect only moves focus into the menu when the panel role is "menu" (`overflow-menu.tsx:38-42`), and the move and confirm views clear that role (`subject-row-menu.tsx:163`).
- Fix: move focus to the first control on every view change and keep the menu role on the move view.
- Refs: `apps/web/src/ui/overflow-menu.tsx:38-42` and `:85-91`; `apps/web/src/dashboard/subject-row-menu.tsx:163`.

**D5. Move under… picker is hard to read (Medium, Fact).**
- User sees: a flat alphabetical list of full paths ("Math / Algebra"), a "Top level" entry, and no mark on the current parent. Choosing the current parent closes the menu with no message. Long lists scroll inside a 288px box with no filter.
- Why it hurts: the user cannot see where the subject sits now, and a long list has no way to narrow down.
- ARIA: the move items keep `role="menuitem"` while their container has no menu role, so screen readers get orphaned menu items.
- Fix: mark the current location, show the hierarchy with indentation, add a type-to-filter field, and confirm the result.
- Refs: `apps/web/src/dashboard/subject-row-menu.tsx:297-339`, `:116-119`, `:300-322`.

**D6. Menu overlaps its own card and the rows below (Medium, Fact for the placement; visual result UNVERIFIED).**
- User sees: the 224px panel opens from the ⋯ button and covers the card's own text and the sub-subjects beneath it. It is not clipped by the card.
- Why it hurts: on a phone the move list (up to 288px tall) can run past the bottom of the screen, and nothing flips it upward.
- Fix: flip the panel above the trigger when there is no room below, and use a bottom sheet on narrow screens.
- Refs: `apps/web/src/ui/overflow-menu.tsx:131` (`absolute right-0 top-full z-20 w-56`); `apps/web/src/dashboard/subject-row-menu.tsx:298` (`max-h-72`).

**D7. Deep nesting and phone width (Medium, Assumption; UNVERIFIED).**
- User sees: each level indents 24px (`pl-6`) and wraps the child in another bordered card. At a 375px phone, content is about 335px wide; by level 4 the name has about 240px after the grip, the toggle, and the 56px right padding reserved for ⋯.
- Why it hurts: the name span has no truncation, so long names and the "N sub-subjects · N curricula" text compete for the same space. The ⋯ button is pinned to the top (`top-2`), not centered, so on a two-line wrapped name it sits high.
- Fix: stop adding indentation after two levels or add a left guide line, truncate names, and center the ⋯ button vertically.
- Refs: `apps/web/src/dashboard/dashboard-subject-list.tsx:207`, `:209`, `:224`, `:237`.

**D8. Search loading, empty, and error states (Medium, Fact).**
- Loading: "Searching…" is light grey text (`text-neutral-400`) with no live region around the results panel, so screen readers never hear that results arrived or how many there are. Source: `dashboard-subject-search.tsx:109`, `:114-117`.
- Error: "Couldn't search subjects — try again." has no retry button; the user must retype (`:110-113`).
- Clear: only Escape clears the field (`:86-90`). There is no visible clear control beyond the browser's native one, which not every browser shows.
- Scope: searching unmounts the whole tree (`dashboard-view.tsx:132`), so results cannot be expanded, reordered, or acted on from the ⋯ menu. Typing past 100 characters is cut off silently (`:100`).
- Fix: add a polite live status ("4 subjects match"), a retry button, and a visible clear button.

**D9. Reorder feedback (Medium, Fact).**
- Success is silent. Failure puts red text at the bottom of the sibling group, which for a nested group can be far from the row, and shows the raw `error.message` (`sortable-subject-group.tsx:94`, `:109-113`).
- Fix: confirm success briefly and show the failure next to the moved row in plain words.

**D10. Drag announcements for screen readers (Low, Assumption; verify with a screen reader).**
- The sortable group sets no custom announcements (`sortable-subject-group.tsx:100`), so the library's default messages are used. Those messages most likely speak the internal subject ID rather than the name.
- Fix: pass announcements that use the subject name and new position.

**D11. Add sub-subject always creates the same kind (Low, Fact; product question).**
- The kind is hard-coded to 'architecture-mentor' (`routes/index.tsx:85`), and the user has no say. Confirm this default with the product owner.

**Code note.** `dashboard/dashboard-tree.tsx` is not imported anywhere (Fact, by search); it appears to be dead code.

## Subject page (routes/subject.$subjectId.tsx, subject/subject-section.tsx, subject/subject-header-menu.tsx)

**S1. Subject delete has the same missing warning as D1 (High, Fact).**
- The confirm reads "Delete {name}?" (`subject-header-menu.tsx:170`) and says nothing about curricula or sub-subjects.
- The header menu also lacks Add sub-subject and Move under (`:118-126`), so a subject can only be nested from the dashboard. This is inconsistent and hides the nesting feature from anyone who starts on this page.
- Fix: share the D1 warning and offer the same nesting actions here.

**S2. Curriculum and category drag has no keyboard path and possibly no touch path (High, Fact for keyboard; touch UNVERIFIED).**
- Keyboard: the page's drag context uses only the pointer sensor (`subject-section.tsx:118-122`). The grip buttons ("Drag to reorder" at `:463-470`, "Drag to nest" at `:369-376`) take focus, but Space and the arrow keys do nothing. Curricula have no ▲▼ fallback on this page.
- Touch: the grip buttons lack `touch-none` (`:371`, `:465`), unlike the dashboard grip, so a finger drag probably scrolls the page instead. Verify on a device.
- Fix: add the keyboard sensor, add ▲▼ buttons for curricula, and add `touch-none` to both grips.

**S3. Curriculum delete is one click after "Delete" and has no error path (High, Fact).**
- The inline "Delete" becomes "Confirm" (`curriculum/shape-controls.tsx:230-245`) with no statement of what is lost.
- `DeleteCurriculumButton` has no try/catch (`subject-section.tsx:532-537`). If the request fails, the button stays disabled and the user sees nothing.
- Fix: name the content that will be deleted in the confirm text and show an error on failure.

**S4. "Add knowledge" and "+ New material" are easy to confuse (Medium, Fact for labels; comprehension Assumption).**
- Two side-by-side actions: a dark "+ New material" (`create-material-form.tsx:200-206`) and an outlined "Add knowledge" link (`subject-section.tsx:273-280`).
- "Add knowledge" navigates to another page and carries no arrow, and nothing explains how the two differ.
- Fix: rename to make the difference explicit (for example "Add from text or link ›") and add a one-line hint.

**S5. Drop-to-nest confirmation is hard to notice (Medium, Fact).**
- After a drop, a small lowercase "confirm / cancel" bar appears under the target card only (`subject-section.tsx:397-430`). The source item shows no state.
- Reorder errors appear under the whole list (`:259-263`), and success is silent.
- Fix: show the confirm bar near both items, capitalize the buttons, and confirm success.

**S6. Curriculum row is crowded (Medium, Assumption; UNVERIFIED on a phone).**
- One row holds the grip, the name with badges and status, and three text actions (Merge, Move, Delete) (`subject-section.tsx:463-494`, `:515-523`). At 375px the name will truncate heavily.
- Fix: move the three actions into the ⋯ menu or onto a second line on narrow screens.

**S7. Low-contrast hint text (Low, Fact).**
- "No curricula yet." uses `text-neutral-400` (`subject-section.tsx:243`), about 2.5:1 on white.

## Paste page (knowledge-source/add-knowledge-form.tsx)

**A1. Subject picker and the "Adding to" line repeat each other (Medium, Fact).**
- The select already shows the chosen subject, and the line below says "Adding to: …" (`add-knowledge-form.tsx:165-186`). The line reads "Adding to: No subject" when unset, but never says what "no subject" means for the sources.
- Fix: keep one of the two and explain what an unassigned source does.

**A2. Long subject paths may overflow the select on a phone (Medium, Assumption; UNVERIFIED).**
- The select is sized to its longest option inside an inline flex label (`:165-181`).

**A3. Submit button gives no reason when disabled (Medium, Fact).**
- The button is disabled until a block has text (`:263-270`), with no helper text saying what is missing.
- Fix: add "Add some text or a link first" as helper text.

**A4. Error message gives no reason (Low, Fact).**
- "Block 1 could not be added. Try again." (`:33-41`). The failed blocks are kept, which is good, but the user is not told why.

**A5. Positives (Fact).** Success copy sets expectations ("Questions take a minute or two", `:143-147`). Mode buttons expose state with `aria-pressed` (`:193`, `:203`). The subject is preselected from the subject page (`:48`).

## Shared menu (ui/overflow-menu.tsx)

**M1. Trigger target is 32px (Low, Fact).** The ⋯ button is `h-8 w-8` (`overflow-menu.tsx:121`). That passes the 24px minimum but falls short of the 44px touch guideline. The glyph is plain text with no visible affordance beyond the trigger itself. The aria-label is good (`:116`).

**M2. Menu role depends on the view (Medium, Fact).** The panel gets the menu role only in the actions view (`overflow-menu.tsx:129`; `subject-row-menu.tsx:163`). Items in other views keep the menu-item role, which causes D4 and D5.

**M3. Positives (Fact).** Arrow, Home, and End keys move between items (`overflow-menu.tsx:99-108`). Escape restores focus to the trigger (`:85-91`). Outside clicks close the menu (`:44-58`).

**M4. Touch and outside clicks (UNVERIFIED).** Outside clicks use `mousedown` (`:49-58`). Touch browsers usually send a synthesized mousedown after a tap, but test on a device.

## Top 8 fixes

1. Delete confirm names curricula removed and sub-subjects moved up.
2. Expand the parent and highlight the new or moved subject.
3. Keep focus inside menus after every view change and delete.
4. Give subject page drags keyboard and touch-safe reordering.
5. Add a "Drag rows to reorder" hint and larger grips.
6. Move picker: mark current parent, indent tree, add filter.
7. Subject page header menu: same delete warning and nesting actions.
8. Search: live result count, retry button, visible clear button.

END-OF-REPORT
