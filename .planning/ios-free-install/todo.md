# iOS free install and local testing
## ios-web-parity

### Scope
- Bring the iPhone app up to most of the web app's everyday features.
- Reuse screens that already exist in the app but are not reachable.
- Out of scope: Admin-only, observability and model-comparison pages.

### Goal
- The owner can do on the phone nearly everything they do daily on the web.

### Coding tasks
- [x] Link the subject extras (knowledge map, priority review, recommendations) from the subject screen and expose the duplicate-cleanup tool.
- [x] Add an Export action on the iPhone so the owner can back up their cards, matching the web export.
- [x] Let the owner start a review from a tag, a topic or a single card, matching the review scopes the web offers, not only from a subject.
- [x] Let the owner edit, move or delete a single card from its detail screen, not only through bulk selection.
- [x] Add a Today overview and a way to open the existing progress, streak, learning list, study sessions, notes and search screens from the iPhone tab bar, because they are built but cannot be reached.

### Notes


## ios-install-reliability

### Scope
- Keep the free-account install alive without the cable.
- Out of scope: Paid Apple program and TestFlight.

### Goal
- The phone app is reinstalled weekly over Wi-Fi without the owner doing anything.

### Criteria
- [ ] The Monday schedule runs and reinstalls over Wi-Fi
- [ ] A failure notifies the owner

### Coding tasks
- [ ] Run the weekly scheduled reinstall once by hand and confirm it works over Wi-Fi with the phone unlocked.

### Notes


## ios-ui-polish

### Scope
- Make the iPhone screens match the web app's set and look good.
- Out of scope: Backend and data code.

### Goal
- Each tab looks designed and can be previewed without the API.

### Criteria
- [ ] Subjects list redesigned
- [ ] Each tab has a preview with sample data

### Coding tasks
- [x] Underline the target phrase inside the answer sentence on triage cards, and make the card front a Russian meaning plus a precise English synonym instead of a vague English scene.
  - Why: The old English front could not be guessed, so the user did not know which phrase to say.
- [x] Add a triage history in its own place (for example under More) that lists past triage sessions and their decisions, so the summary no longer has to appear after triaging.
  - Why: The user still wants to look back at what was triaged.
- [x] When triage is finished, send the user straight to the subject list or the knowledge inbox instead of showing a summary screen or a Keep triaging button.
  - Why: Finishing triage should not add an extra screen to dismiss.
- [x] Reorder the bottom tab bar to Triage, Review, Add, Chat, More, with Knowledge and Subjects reachable from the More list.
- [x] Remove the nested More screen: the More tab should list Knowledge, Subjects and everything that used to sit inside the nested More directly in one flat list.
- [x] Make the Again, Hard, Good and Easy buttons even taller, and add a setting that lets the owner choose their size from XS up to XXL.
- [x] Move the "reviewed this session" counter on the review screen to the bottom of the screen.
- [x] Remove the "grade waiting to send" text from the review screen, since answers now send in the background and the owner does not need to see it.
- [ ] Fix the Review tab on the production iPhone app: it shows the subject list as failing to load even though the server answers successfully and other screens list subjects fine, so find why the production data does not display and make the list load.
- [x] Make the review answer buttons (Again, Hard, Good, Easy) much larger so they are easy to hit with a thumb.
- [x] Make every iPhone screen refresh when pulled down, including the Add and More tabs and the Triage swipe screen, not only the lists that already do.
- [ ] Let the owner mark subjects as priority, including deeply nested ones, so they are highlighted in the Review and Subjects lists and their cards are served first in review; this needs a stored flag on the subject and an API change.
- [x] On the iPhone Review tab, show a list of subjects first with each one's due and new card counts, total cards and progress bar; the owner picks a subject, then taps a bottom Start review button.
- [x] On the iPhone card detail screen, put Suspend and Generate more question variants into one always-visible vertical actions menu (a three-dot menu) instead of two separate buttons.
- [x] On the iPhone card detail screen, show the question and the answer as multi-line text areas instead of single-line input fields.
- [x] When finishing Triage, show two bottom buttons, Keep triaging and Finish triage; choosing Finish triage shows an optional feedback box and then a Done button.
- [x] In swipe Triage, treat even a slight left or right swipe as a decision so the card is rejected or approved without a long drag.
- [x] In Triage, make the Approve buttons green on the swipe screen and on the pending list rows.
- [x] In swipe Triage, do not show the remaining item count when fewer than 3 items are left.
- [x] On the iPhone Review screen, after the answer is shown, show four grading buttons at the bottom (Again, Hard, Good, Easy) that sit above the tab bar without overlapping it.
- [x] On the iPhone Review screen, end the main content above the tab bar so the Show Answer button never overlaps the bottom menu.
- [x] On the iPhone Add knowledge screen, make the subject selector hierarchical (subjects with their sub-subjects shown as a tree or drill-down) instead of one flat list.
- [x] On Triage cards, mark the question with a Q inside a small square and the answer with an A inside a small square, instead of text labels.
- [x] On the Triage screens, stop showing the card type label (such as Basic) for now, since it adds noise.
- [x] On each pending Triage card, add a little more space above the Reject, Edit and Approve buttons so they do not crowd the text.
- [x] On the iPhone Triage list, center the Approve all button instead of leaving it at the left edge.
- [x] On the iPhone, make Start Triage and Finish Triage bottom buttons that sit above the tab bar without overlapping or hiding it, so the owner can still switch tabs while the button is visible.
- [x] Let the owner reach the admin settings from the iPhone Settings screen, including choosing the extraction model, new cards per day and the other options the web admin page offers, saved through the same API.
- [x] In swipe Triage, draw the card as a real card (rounded corners, shadow, margin from the screen edges, a distinct background) so the owner sees a card being swiped instead of the whole screen moving.
- [x] On a subject's screen show its stats (card count, the hardest cards) and let the owner close the gaps on those hardest cards right away from there.
- [x] Let the owner start a review session limited to one subject from that subject's screen, following the normal review schedule but only with that subject's due cards.
- [x] On the Triage pending-items card with Reject, Edit and Approve, drop the title line (it only repeats the front and back joined together) and show just the subject, the front, the back and, if present, a shortened example.
- [x] In swipe Triage, let the swiped card fly fully off the screen first, then bring in the next card with a short fade or slide of 200 to 400 milliseconds, instead of swapping cards at once.
- [x] Move every key button on the iPhone screens to the bottom of the screen so the owner can reach it with one thumb, starting with Finish Triage on the swipe Triage screen, then Review, Add and the other tabs.
- [x] In the swipe Triage mode, let the owner tap a card to edit its text before deciding, and show a remaining count plus a clear finished state when no cards are left. Editing is the rare path, so it must not get in the way of swiping.
- [x] Replace the Triage list on the iPhone with a one-card-at-a-time mode: swiping a card left rejects it and swiping right approves it, with no buttons on the card. A short list of subjects above lets the owner start the session on one subject or on all of them.
- [x] On the iPhone Triage screen, show each card as its front, its back and an optional example, then the original source it came from and an optional note, instead of the current mixed card view. The example is a separate part and should not appear to be part of the front or back.
- [x] Once the answer is shown, tapping the right half of the screen grades the card Good and tapping the left half grades it Bad. No visible zones or hints, the gesture should feel natural.
- [x] On the Review screen, put the Show Answer button at the bottom of the screen and let a tap anywhere on the card reveal the answer. This makes reviewing one-handed and faster.
- [x] Rename the course-level wording once the owner picks the new name.
- [x] Add previews with sample data for the Review, Triage, Add and Knowledge screens so they can be restyled without the API.

### Notes


## ios-sign-in

### Scope
- Sign in to the iPhone app with the owner's email and password, and sign out.
- Out of scope: Magic-link or sign-up flows on iPhone.

### Goal
- The owner can sign in with email and password and sign out on the phone, and the app then loads data.

### Criteria
- [ ] Sign in stores a working access token
- [ ] Sign out clears the token and returns to a signed-out state
- [ ] Wrong password shows a clear message

### Coding tasks
- [ ] [blocked: user] Sign in on the phone with the owner's real login against production and report whether it works; this needs the owner's password and an unlocked phone.
  - Why: Only the owner can enter the password.
  - Decision: Owner tries it, or sets the dev password for the Dev app.
  - Default: Owner tries production sign-in on the phone.
- [x] Show a sign-in screen when no token is saved instead of empty screens with errors.
- [ ] Check on the phone that email and password sign-in works against the production API and fix anything that fails.

### Notes


## ios-local-testing

### Scope
- Test the iPhone app against the API running on the owner's Mac over home Wi-Fi.
- Out of scope: Production deploys.

### Goal
- Tapping the Post Anki icon on the phone connects to the local API with no manual setup.

### Criteria
- [ ] A Debug build installs on the phone over Wi-Fi
- [ ] The app loads data from the local API on the Mac
- [ ] Release builds still refuse plain http except localhost
- [ ] The README explains starting the local API and switching back to production
- [ ] The Dev iPhone app and the local web app read only the local Postgres database, and the production iPhone app and production web app read only the production Neon database

### Coding tasks
- [x] Add a one-command script that sets every approved card in the local development database back to waiting for triage, so there is plenty to practise swiping on. It must refuse to run against anything but the local Postgres container, never production.
- [x] Make the local API refuse to start in development mode unless its database is the local Postgres container, so the Dev iPhone app and the local web app can never touch production by mistake.
- [x] Write the short how-to for local testing into the iOS README.
- [x] Install a Debug build that points at the Mac's local API address and confirm the phone reaches it.

### Notes


