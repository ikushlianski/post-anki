# Create subjects automatically during ingestion
## subject-creation

### Scope
- Detect the subject of ingested knowledge from the existing subjects first; only when none fits, let a cheap model propose and create a new subject, which should be rare.
- Let raw knowledge ingestion carry an explicit subject so detection and creation are skipped.
- Remove the placement suggestions feature.
- Out of scope: Merging or renaming existing subjects, and any change to the triage swipe screens.

### Goal
- Ingested knowledge lands under a fitting subject, and a new subject is created only when no existing one fits.

### Criteria
- [ ] No placement suggestions remain in the API, web or iPhone app
- [ ] Knowledge ingested with an explicit subject never triggers detection or creation
- [ ] A new subject is created only after existing-subject detection finds no fit
- [ ] Creation has a daily cap and a switch to turn it off

### Coding tasks
- [ ] Let raw knowledge ingestion (web Add knowledge, iPhone Add, the API and the Chrome extension) carry an explicit subject so detection and creation are skipped for it.
- [ ] When ingested knowledge matches no existing subject and the cheap classifier says a new subject is likely, ask a cheap Gemini model for a subject name and parent, validate it strictly, and create it with a duplicate-name check, a daily cap and an off switch.
- [ ] Remove the placement suggestions feature: its web panel, the API routes and background work that produce them, and the iPhone references.

### Notes


