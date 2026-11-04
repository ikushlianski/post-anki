# Plan 2: three-dot actions menu on the approval screen

Scope: the actions menu only. The card-list layout (table) and non-list states belong to other plans. Paths are under `apps/web/src/` unless noted.

## What the learner sees (plain language)

- Each source (one pasted text and its suggested cards) gets one small "..." button at the end of its header. Today that header holds up to five loose buttons ("Compare models", "Regenerate", "Approve all from this source", "Add new KI", and the status text). After this change it holds the "..." button plus a few things that are status or the finishing step.
- The "..." menu lists: Add new KI, Approve all from this source (shows the Shift+A hint), Regenerate..., Compare models on this text.
- Approve, Approve with feedback, Reject, Reject with feedback, and the page-level "Approve all ready (N)" stay visible exactly as they are. So do "Mark as processed" (the finishing step once all cards are decided), the "Regenerating..." status line, the failed-run message with Retry, and Reopen on processed sources.
- Picking Regenerate... closes the menu and shows the same "Replace N undecided suggestions?" box with the model picker. Nothing is replaced until the learner picks a model and presses Replace. Picking "Approve all from this source" shows the same "Approve N items?" box; nothing is approved until Confirm.
- While a source regenerates, Regenerate... and Add new KI stay in the menu but are greyed out with a short reason underneath ("Regenerating..." / "Wait for regeneration to finish"). Today Add new KI silently disappears; now the learner sees why it is unavailable. Compare stays usable.
- Sources that are processed (collapsed "Processed" list) get no menu. They have one action, Reopen, and a menu with one item is worse than a button.
- Keyboard: Enter or Space opens the menu and focus lands on the first item. Arrow Up/Down, Home and End move between items (greyed-out items can be reached, so a screen reader announces them as unavailable and reads the reason). Escape closes and returns focus to "...". Tab closes it. The review shortcuts (j k a r A 1-5) are switched off while focus is inside the menu; otherwise pressing "a" on a menu item would approve a card.
- Touch: the "..." button and each menu row are 44 px tall on phones (32 px on desktop), the same as the buttons restyled last round.

## Inventory of secondary actions (today)

| Level | Action | Shown now when | Enabled/disabled now | Destructive | Opens | Decision |
|---|---|---|---|---|---|---|
| Source | Compare models on this text (a link to /admin-compare-models?sourceId) | source has text | always enabled; leaves the page | no | navigates | menu item (link) |
| Source | Regenerate | source has text; states idle / confirming / starting / running / failed | disabled while starting or running; replaced by Retry when failed | replaces undecided suggestions and costs tokens; already guarded by a confirm box | inline confirm box with model picker | menu item "Regenerate..."; confirm box, status and Retry stay inline |
| Source | Approve all from this source | 2 or more ready cards; replaced by confirm box while confirming | enabled | bulk, hard to undo; already guarded by a confirm box | inline confirm box | menu item; confirm box stays inline (Shift+A already triggers the same state) |
| Source | Add new KI | not while starting or running | enabled | no | inline draft card, focuses Front | menu item; disabled with reason instead of hidden while regenerating |
| Source | Mark as processed | source fully reviewed; hidden while regenerating | disabled while busy | no (Reopen undoes it) | none | stays visible: it is the primary finishing step |
| Processed row | Reopen | processed rows | disabled while busy | no | none | stays visible, no menu |
| Card | Approve, Reject, with-feedback variants, Cancel on a new draft | always | disabled while resolving or unsaved | reject is a decision with Undo | feedback box | stay visible (primary, as the brief says). No secondary card action exists today, so no card-level menu |
| Page | Approve all ready (N) | N > 0 | enabled | bulk, confirm box | inline confirm | stays visible (primary) |

Not actions, untouched: the extraction grade widget (rating plus note), the decision strip (Undo/Dismiss), and the Processed summary toggle.

## Approach (technical)

**Dependency.** Fact: apps/web/package.json has no dropdown or menu library. Fact: `ui/overflow-menu.tsx` (166 lines, with tests) already implements a "..." trigger plus menu panel with Escape, arrow keys, Home/End, focus return, outside-click close, 44 px touch targets, and is used by `dashboard/subject-row-menu.tsx`, `subject/subject-header-menu.tsx` and the subject move picker. Fact: TECH-STACK-BY-PROJECT.md lists no UI component library for post-anki. Default chosen: reuse `OverflowMenu`, add no dependency, and write no new menu behavior.

Known gaps of `OverflowMenu` (Fact, from reading it): the panel is `position:absolute` with no portal, so any ancestor with `overflow: hidden/auto` (a scrollable table wrapper) clips it; no ArrowDown-to-open on the trigger; no typeahead. With 4 items typeahead does not matter.

**PROPOSAL (not decided; needs your call): Base UI Menu, `@base-ui/react`.**
- Why: portal rendering (not clipped by the table), collision-aware positioning, full menu keyboard model, typeahead, disabled-item semantics, unstyled so it takes the existing Tailwind classes. Assumption: Base UI is the long-term maintained choice (it is from the Radix/MUI authors; release notes show 1.0.0 on 2025-12-11 and later 1.x releases, source: https://base-ui.com/llms.txt). Verify its current Menu API before adopting.
- Tradeoffs: first UI-primitive dependency in the web app; new styling and test patterns (portal in jsdom); the three existing subject menus would not use it, giving two menu implementations unless migrated later.
- Alternatives: `@radix-ui/react-dropdown-menu` (very widely used, similar API, weaker collision handling than Base UI is an assumption), React Aria Components `Menu` (strongest accessibility, heavier, different styling model).
- When it matters: only if the table plan places the menu inside a clipping container. The swap is contained, since only `ui/actions-menu.tsx` would change and its props stay the same.

**Components (no new boundary; one reusable component with a stable contract).**
```ts
// ui/actions-menu.tsx
type ActionsMenuItem =
  | { kind: 'action'; id: string; label: string; onSelect: () => void; testId?: string
      disabledReason?: string; destructive?: boolean; shortcutHint?: string; restoreFocus?: boolean }
  | { kind: 'link'; id: string; label: string; to: LinkProps['to']; search?: LinkProps['search']; testId?: string }
interface ActionsMenuProps { label: string; testId?: string; items: readonly ActionsMenuItem[]; ref?: Ref<OverflowMenuHandle> }
```
- Empty `items` renders nothing. An item with `disabledReason` renders `aria-disabled="true"` (stays focusable, click/Enter do nothing) and shows the reason as small text linked with `aria-describedby`. `destructive` renders red text. Rule in the docs: a destructive or costly item never fires on one click; its `onSelect` only opens an existing confirm step. `restoreFocus` defaults to true; false means the item moves focus elsewhere itself.
- `knowledge-bit/knowledge-bit-review-source-actions-menu.tsx` exports `SourceActionsMenu({ sourceId, sourceText, readyCount, regeneration, isConfirmingBulk, onRegenerate, onApproveAll, onAddItem, ref })`. This is the slot the list and non-list plans use; they pass data and callbacks only.
- `knowledge-bit/knowledge-bit-review-source-actions.ts` holds the pure `buildSourceActionItems(input)` (state to items), unit tested without rendering.

**Menu content per state.**
- Has text: Regenerate... and Compare. No text: both hidden (nothing to regenerate or compare).
- `readyCount > 1` and not confirming: Approve all from this source. Otherwise hidden.
- regeneration `starting` or `running`: Regenerate... disabled ("Regenerating..."), Add new KI disabled ("Wait for regeneration to finish").
- `failed`: Regenerate... enabled (it reopens the confirm so another model can be picked; Retry stays inline). `confirming`: enabled, idempotent.
- Processed: no menu. Order: Add new KI, Approve all, Regenerate..., Compare.

**Focus after selecting.** Regenerate... and Approve all use `restoreFocus:false`: `RegenerateConfirm` focuses its panel on mount and `KnowledgeBitReviewBulkConfirm` focuses Cancel on mount. Cancel on either returns focus to the "..." button through the ref handle's `focusTrigger`. Add new KI uses `restoreFocus:false` too; the draft card already focuses Front.

**Styling.** The trigger reuses the `SECONDARY_BUTTON_CLASS` look (border, shadow, 44 / `sm:` 32 px, same focus ring) through a new exported `MENU_TRIGGER_CLASS` in `knowledge-bit-review-classes.ts`, with a lucide `MoreHorizontal` icon. Menu rows reuse `OVERFLOW_MENU_ITEM_CLASS` plus an `aria-disabled:` variant (grey text, no hover). `OverflowMenu` gets two additive optional props, `triggerClassName` and `triggerContent`, defaults unchanged so the subject menus are untouched.

## Steps

1. `ui/overflow-menu.tsx`: add optional `triggerClassName` and `triggerContent` (defaults keep current look). `knowledge-bit/knowledge-bit-review-classes.ts`: add `MENU_TRIGGER_CLASS`.
2. New `ui/actions-menu.tsx` (target ~110 lines): wraps `OverflowMenu` (`panelRole="menu"`, `viewKey="actions"`, own open state). Item click: ignore if disabled, run `onSelect`, close with `restoreFocus` rule. Render link items with TanStack `Link role="menuitem"`, as `subject-row-menu.tsx` does.
3. New `knowledge-bit/knowledge-bit-review-source-actions.ts` (`buildSourceActionItems`, ~60 lines) and `knowledge-bit-review-source-actions-menu.tsx` (~50 lines). Keep the existing test ids on the items (`knowledge-bit-review-regenerate-<id>`, `-compare-<id>`, `-add-item-<id>`, `-approve-source-<id>`); trigger id `knowledge-bit-review-source-actions-<id>`.
4. `knowledge-bit-review-regenerate.tsx`: remove the idle "Regenerate" button and the disabled duplicate. Idle renders nothing; confirming, starting/running ("Regenerating..." status, `aria-live`) and failed (alert + Retry) stay. `RegenerateConfirm` focuses itself on mount.
5. `knowledge-bit-review-bulk-confirm.tsx`: focus Cancel on mount.
6. `knowledge-bit-review-source-group.tsx`: remove the Compare `Link`, the "Approve all from this source" button and the `KnowledgeBitReviewAddItemButton` call; render `SourceActionsMenu` last in the header; own the `menuRef`; wrap the two cancel callbacks to call `focusTrigger`. The file shrinks (217 now). `knowledge-bit-review-draft-list.tsx`: delete `KnowledgeBitReviewAddItemButton`. Do not touch `knowledge-bit-review-panel.tsx` (474 lines, already over the limit); every needed prop already reaches the source group.
7. `knowledge-bit-review-keyboard.ts`: `resolveReviewKey` returns null when the target is inside `[role="menu"]`.
8. Update the existing tests listed below, then the stories `storybook/knowledge-bit-review/knowledge-bit-review-source-group.stories.tsx` and `knowledge-bit-review-add-item.stories.tsx` (add a "regenerating, menu items disabled" story).

## Tests (vitest and react-testing-library, `describe` / `it('should ...')`, co-located)

New, `knowledge-bit-review-source-actions.test.ts` (pure):
- should offer Regenerate and Compare only for a source that still has its text
- should offer Approve all from this source only when two or more cards are ready and no confirm is open
- should grey out Regenerate and Add new KI with a reason while a regeneration is starting or running
- should keep Regenerate available after a failed run so another model can be chosen
- should keep Compare available while regenerating

New, `ui/actions-menu.test.tsx`:
- should render nothing when there are no items
- should not run a greyed-out item when it is clicked or Enter is pressed, and should still let keyboard users reach it
- should read the disabled reason to screen readers through the item description
- should close and return focus to the trigger after choosing an item, unless the item says it moves focus itself
- should close on Escape with focus back on the trigger, and on Tab
- should move between items with arrow keys, Home and End
- should show a destructive item in red and run its callback only once per selection

New, `knowledge-bit-review-source-actions-menu.test.tsx`:
- should show a "..." button named after its source and open the four actions
- should navigate to compare models with this source's id when Compare is chosen (link href has `sourceId`)

Updated:
- `knowledge-bit-review-keyboard.test.ts`: should ignore review shortcuts while focus is inside an open menu
- `...panel.regeneration.test.tsx`: `openConfirm` opens the menu first; should show Regenerate greyed out with a reason while regenerating (replaces the "disabled button" check); should not offer Regenerate for a source whose text is gone; should return focus to "..." when the confirm is cancelled
- `...panel.manual.test.tsx`: should offer Add new KI in the menu on open and fully reviewed entries; should grey out Add new KI with a reason while regenerating (replaces "hide"); should focus Front of the new draft after choosing it
- `...panel.bulk.test.tsx`, `...panel.bulk-confirm.test.tsx`: open the menu before choosing Approve all from this source; confirm box still guards the approval
- `...panel.processing.test.tsx`: should keep Regenerate and Compare in the menu of a fully reviewed entry; should show no menu on processed rows
- `...panel.test.tsx` (compare link tests, lines ~92-104): same assertions through the menu
- Shared helper `knowledge-bit-review-source-actions.test-utils.ts`: `openSourceActions(sourceId)`.

## Done when

- No Compare, Regenerate, Approve-all-from-source or Add new KI button remains loose in the source header; all four are reachable from one "..." menu per open source.
- Approve, Reject, with-feedback, Approve all ready, Mark as processed, Retry, Reopen are unchanged and visible.
- Regenerating disables Regenerate... and Add new KI with a visible and spoken reason; processed rows have no menu.
- Regenerate and bulk approve still require their confirm step; nothing runs from the menu click alone.
- Menu works by keyboard alone, review shortcuts do not fire from inside it, tap targets are 44 px on touch.
- `ActionsMenu` and `SourceActionsMenu` props match the contract above, every new file is under 300 lines, `npx vitest run src/knowledge-bit src/ui` and `npx tsc --noEmit` in apps/web pass (the existing 'superseded' tsc error in `knowledge-bit-review-bulk-result.ts` is pre-existing).

## Defaults chosen

- Reuse `OverflowMenu`, no new dependency: it is the project's own pattern and covers this screen; the library is proposed, not decided.
- "Approve all from this source" goes in the menu: styled secondary last round, the page-level "Approve all ready" and the Shift+A key remain the fast paths.
- Mark as processed stays visible: styled primary last round and it is the finishing step.
- Confirm boxes, status and Retry stay inline: they hold a model picker and live status, which do not fit a menu panel and are already tested there.
- Disabled with a reason, not hidden, for temporary blocks; hidden when an action can never apply (no text, one card, processed).
- No card-level menu: no secondary card action exists; the contract allows one later.
- Test ids kept on menu items so selectors in tests only need the extra "open the menu" step.
- Focus on Cancel (not Confirm) in the bulk confirm, the safer default for a bulk action.

END-OF-REPORT
