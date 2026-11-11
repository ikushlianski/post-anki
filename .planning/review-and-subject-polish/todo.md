# Review screen and subject polish

## per-subject-daily-limits

### Scope
- Each subject can set its own new cards per day and reviews per day, overriding the global setting.
- Out of scope: Changing how the review scheduler orders cards.

### Goal
- Each subject can cap its own daily new cards and reviews.

### Criteria
- [x] A subject limit overrides the global one in its queue
- [x] An empty subject limit falls back to the global setting
- [x] Web, Mac and iPhone subject options show both limits

### Coding tasks
- [x] Show daily new card and review limits in each subject's options on all apps; blank means global.
- [x] Make the review queue honour each subject's own daily caps, with parents' caps covering their sub-subjects.

### Notes
- Owns apps/api/src/subject-study-options and the subject options screens on web and apple apps.

## subject-picker-search

### Scope
- The move-cards and choose-subject pop-ups get a search box, focused on open, that filters subjects as you type.
- Out of scope: Server-side subject search.

### Goal
- Choosing a subject in any picker pop-up starts with typing to filter.

### Criteria
- [ ] The search box has focus when the picker opens
- [x] Typing narrows subjects and sub-subjects by name
- [x] Enter picks the single remaining match

### Coding tasks
- [x] Add an auto-focused search box to the web pickers for moving cards or choosing a subject.
- [x] Add the same auto-focused search to the Mac and iPhone subject pickers.

### Notes
- Owns apps/web/src knowledge-browser and focus subject pickers and the apple subject picker views.

## card-maturity-colors

### Scope
- Mature, Learning and New counts in subject and sub-subject lists use one consistent colour each, on every app.
- Out of scope: New statistics screens.

### Goal
- Mature, Learning and New counts are told apart by colour at a glance.

### Criteria
- [x] Each of the three counts has its own colour everywhere
- [x] Zero counts stay grey
- [x] Colours read well in light and dark mode

### Coding tasks
- [x] Colour Mature, Learning and New counts in web, Mac and iPhone subject lists with one palette.

### Notes
- Owns apps/web/src subject-today-columns and stats-card-maturity, MacReviewSubjectRowView and the iPhone maturity section.

## mac-detail-font-size

### Scope
- Mac app detail pane text matches the sidebar's readable size instead of the tiny default.
- Out of scope: iPhone layout changes.

### Goal
- Mac detail pane text is as readable as the sidebar.

### Criteria
- [x] Review screen body text matches sidebar text size
- [x] Other detail screens use the same larger base size

### Coding tasks
- [x] Find why Mac detail screens use the small size and raise their text to the sidebar size.

### Notes
- Owns apps/ios/Sources/PostAnkiMac root layout and detail views; built after card-maturity-colors since both edit Mac review rows.
- Depends on card-maturity-colors.

## sidebar-without-study-plan

### Scope
- Study plan is no longer a sidebar item; its settings stay reachable from each subject.
- Out of scope: Deleting the study plan screen itself.

### Goal
- The sidebar no longer lists Study plan.

### Criteria
- [x] Mac, iPhone and web navigation show no Study plan item
- [x] Subject limits and levels stay editable from subject options

### Coding tasks
- [x] Remove Study plan from Mac sidebar, iPhone More list and web sidebar; keep its settings per subject.

### Notes
- Owns the Mac sidebar, apps/ios more-destination and the web sidebar navigation.

## knowledge-created-column

### Scope
- The all-knowledge browser shows when each card was created, date and time, and can sort by it.
- Out of scope: Filtering by date range.

### Goal
- Browsing all knowledge shows each card's creation date and time.

### Criteria
- [x] Each row shows the card's creation date and time in local time
- [x] The column sorts newest or oldest first
- [x] Mac column titles line up with their cells

### Coding tasks
- [x] Line up Mac knowledge browser column titles with their cells; Subject, State and Due are offset.
- [x] Add a sortable Created column with local date and time to the web and Mac knowledge browsers.
- [x] Split the Mac knowledge browser: card list on top, selected card's question, answer and examples below.

### Notes
- Owns apps/web/src/knowledge-bit knowledge browser table and the Mac knowledge browser list.
- Depends on subject-picker-search.

