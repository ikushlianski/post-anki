# Optional triage and subject complexity levels

## triage-setting

### Goal
- New cards go straight into their subject unless the learner has switched triage on, and triage is off by default.

### Criteria
- [x] With triage off, a card made from a new note is studyable in its subject without any triage step.
- [x] A setting in web and the Mac and iPhone apps turns triage on and off, and its default is off.
- [x] With triage off, the triage tab and badge are hidden in web and the apps.

### Coding tasks

### Notes
- Owns apps/api/src/admin-settings, packages/shared admin settings contract, the card insert paths in apps/api/src/knowledge-bit, web settings and triage navigation, iOS settings and triage tab

## subject-levels

### Goal
- Each subject and sub-subject has a complexity level (Easy, Normal or Cram) that sets how far apart its reviews are, chosen when the subject is created and changeable later.

### Criteria
- [x] A card in an Easy subject gets a Good gap roughly twice as long as the same card in a Cram subject, and Normal keeps today's gaps.
- [x] A sub-subject without its own level uses the nearest parent's level, and a top-level subject defaults to Normal.
- [x] The subject create form and the subject options screen, in web and the apps, let the learner pick the level.
- [x] The options screen previews the next gap for Good and Easy at the chosen level.

### Coding tasks

### Notes
- Owns packages/shared subject study options contract, packages/core study-plan derive, apps/api/src/subject-study-options, apps/api/src/knowledge-bit schedule options, web subject create and options forms, iOS subject create and options screens

## sweep-cap

### Goal
- Imported notes never pile up more than about 100 unseen cards, whether triage is on or off.

### Criteria
- [x] With triage off, the sweep holds back imported notes while 100 or more cards in subjects have never been studied.
- [x] With triage on, the sweep keeps counting cards waiting in triage, as it does today.

### Coding tasks

### Notes
- Owns apps/api/src/knowledge-bit pipeline sweep and its config
- Depends on triage-setting

## approve-waiting-cards

### Goal
- The cards waiting in triage today join their subjects as studyable cards, through a one-off script that only writes when asked to.

### Criteria
- [x] The script by default only reports how many waiting cards it would add to each subject.
- [ ] With its apply flag, every waiting card ends up studyable in its subject, and running it again changes nothing.

### Coding tasks

### Notes
- Owns apps/api/scripts, a new one-off script for approving waiting cards
- Depends on triage-setting
