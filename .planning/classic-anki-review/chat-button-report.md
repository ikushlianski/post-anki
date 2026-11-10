# Floating chat button (2026-10-11)

Item: Stop the floating chat button covering card text on phones, and at every width where it is visible.

## Final design

- Below 640 px nothing floats. The chat opens from an "Ask my cards" entry (44 px high) in the navigation menu; the drawer closes when the chat opens. The two sides talk through a window event (`open-global-card-chat`, `apps/web/src/global-card-chat/global-card-chat-events.ts`).
- From 640 px up the button is a 44x44 round icon at the bottom right (`hidden size-[44px] items-center justify-center rounded-full ... sm:flex`, `aria-label` and `title` "Ask my cards", icon `MessageCircle`), replacing the 122x36 pill.
- From 640 px up the root layout content wrapper reserves a 64 px right gutter (`sm:pr-16` in `apps/web/src/routes/__root.tsx`), equal to the button footprint (16 px margin + 44 px), so cards, source headers and their controls never sit under the button. One place, so every page benefits.
- Two decisions beyond the brief, with reasons:
  - The approve grid now has two columns from `lg` (1024 px) instead of `md`: with the sidebar (224 px) and the gutter (64 px) two columns at 768 px were about 205 px wide each and cramped. At 768 px cards now take one readable column (about 480 px); 1024 px has two, 1280 and 1500 px have three (`xl`).
  - The dev-only TanStack devtools launcher was exactly under the new round button (same corner, higher stacking), so the chat could not be clicked in development. `position` of the devtools is now `bottom-left` in `routes/__root.tsx`. This is development-only and does not change production.

## Check script (`scripts/phone-layout-check.mjs`) changes

- Overlap runs now at 640, 700, 768, 1024 and 1280 px (900 px high) on the approve screen; the probe also includes the source-header buttons and links.
- New assertion in the probe: the chat button must be the topmost element at its own centre (this is what would have caught the devtools launcher covering it).
- The desktop section assertion now expects the chat button to be a 44x44 round icon (was "height <= 36").
- `docs/architecture/phone-layout.md` updated to match.

## Real output

`node scripts/phone-layout-check.mjs --seed` ended with:

```
== chat button overlap (640x900) ==  ... fields or buttons covered: 0
== chat button overlap (700x900) ==  ok   chat button overlap @700       fields or buttons covered: 0
== chat button overlap (768x900) ==  ok   chat button overlap @768       fields or buttons covered: 0
== chat button overlap (1024x900) == ok   chat button overlap @1024      fields or buttons covered: 0
== chat button overlap (1280x900) == ok   chat button overlap @1280      fields or buttons covered: 0
== desktop (1280x800) ==
       ok  chat button is a 44x44 round icon (44x44)
cleanup: deleted 1 feedback row(s) and 0 extraction-grade row(s) that belong to the 1 seeded source(s)
extraction data cleared (sources, suggestions, cards); grades kept
PASS: phone, chat overlap and desktop sections verified   (exit 0)
```

Phone (390 px) lines in the same run: dashboard, add-knowledge, approve (44 measured), review-question, suspended, subject-page, admin-settings and compare models all `small:0`; "chat button on phone: hidden below 640px; reachable through the menu entry (197x44) which opens the chat panel".

Screenshots looked at with a seeded source (taken separately with Playwright, grid columns and topmost check printed): 768 px 1 column, 1024 px 2 columns, 1280 px 3 columns, 1500 px 3 columns; at every width "chat button is topmost". Files: `proof/phone-layout/approve-chat-button.png` (390 px, from the first iteration).

- `npx tsc --noEmit` in apps/web: exit 0.
- `npx vitest run` in apps/web: Test Files 175 passed (175), Tests 1147 passed (1147). Tests updated: the panel test now asserts the labelled 44px round icon (`sm:flex`, `size-[44px]`, `rounded-full`, aria-label and title), plus the menu opening the chat and the menu entry test.
- Seeded data cleared; database state afterwards: 0 sources, 0 feedback rows, 0 comparison runs.

## Left open

- Pages with their own fixed right-side elements (none found) would need the same gutter thinking; the gutter covers the shared layout only.
- Domain map screens are not part of this check.
- The panel itself (opened chat, `w-80`, bottom right) still overlays content while it is open, by design.

END-OF-REPORT
