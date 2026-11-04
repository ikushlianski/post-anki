# Model fusion mode
## fusion-accepted-log

### Scope
- Record which models' output was accepted or rejected at triage and show it in statistics.
- Out of scope: Automatically changing the chosen models from these numbers.

### Goal
- Every triage decision on a fusion candidate is stored with the model or models behind it, and the owner can see per model how often its cards were kept.

### Criteria
- [ ] Each keep or reject is stored with the model ids of that candidate
- [ ] A per-model kept versus rejected count is available from the API
- [ ] The statistics page shows it

### Coding tasks
- [x] Show the per-model kept and rejected counts (field triageByModel on the AI spend statistics response) on the iPhone and Mac Statistics screen.
  - Why: The web page shows them; the native Statistics screen does not yet.
- [x] Add a per-model kept and rejected count to the owner statistics API and show it on the web and iPhone Statistics screens.
  - Why: The record is only useful if the owner can read it.
- [x] Save the model ids of the candidate with every triage keep or reject, reusing the existing feedback by model records where they fit.
  - Why: The owner wants a permanent record of which models are actually useful.

### Notes
- Owns apps/api/src/owner-stats and the knowledge-bit feedback records.
- Depends on fusion-triage.


## fusion-triage

### Scope
- Triage screens on web, iPhone and Mac show each candidate with its model names and let the owner keep the ones they want.
- Out of scope: Changing how single-model triage works when fusion is off.

### Goal
- During triage the owner sees the candidate cards from all chosen models and can keep or reject each one.

### Criteria
- [ ] Each candidate shows the model name or names that wrote it
- [ ] The owner can keep several candidates for the same fact or reject all of them
- [ ] Web, iPhone and Mac triage behave the same

### Coding tasks
- [x] Show the same candidates with model badges in iPhone triage and in the Mac triage view.
  - Why: The three clients must behave the same.
- [x] Show fusion candidates in web triage with model badges and a keep or reject choice per candidate.
  - Why: This is where the owner decides which model's output survives.

### Notes
- Owns apps/web/src/knowledge-bit triage components, apps/ios/Sources/Shared focus-triage and pending-review-triage files.
- Depends on fusion-generation.


## fusion-generation

### Scope
- When fusion mode is on, run card extraction with every chosen model and keep each model's cards as separate candidates.
- Out of scope: Auto-merging or ranking candidates without the owner.

### Goal
- A source added with fusion on produces pending cards from each chosen model, each tagged with the model that wrote it.

### Criteria
- [ ] Every pending card records which model produced it
- [ ] One failing model does not stop the others
- [ ] Identical cards from several models are shown once and credited to all of them
- [ ] Cost per source stays within the existing spend cap

### Coding tasks
- [x] Group near-identical cards from different models into one candidate that lists every model that produced it, and keep a failed model from blocking the rest.
  - Why: Without grouping the owner sees the same card two to five times.
- [x] Run the extraction once per chosen model in parallel, reusing the model comparison runner, and save each returned card as a pending card with its model id.
  - Why: The owner wants to see several models' output side by side.

### Notes
- Owns apps/api/src/model-comparison, apps/api/src/mastra extraction runner and apps/api/src/knowledge-bit ingestion code.
- Depends on fusion-settings.


## fusion-settings

### Scope
- Owner setting to turn fusion mode on and choose two to five models from the existing model list.
- Out of scope: Changing the default single-model extraction path.

### Goal
- The owner can switch fusion mode on in settings and pick two to five models, and the choice is saved and used by card generation.

### Criteria
- [ ] Settings accept two to five distinct known models and refuse fewer or more
- [ ] Fusion mode is off by default and turning it off restores single-model behaviour
- [ ] The setting is editable on the web settings page and in the iPhone and Mac Settings

### Coding tasks
- [x] Add a Fusion mode section to the web settings page and to the iPhone and Mac Settings, with an on/off switch, a model picker limited to five and the estimated cost per source shown.
  - Why: The owner chooses the models themselves and should see what it costs before enabling it.
- [x] Store the fusion switch and the chosen model list in the owner's admin settings, validated to two to five distinct models from the known model list.
  - Why: Generation and triage both need one agreed source for which models take part.

### Notes
- Owns packages/shared/src/admin-settings.ts, apps/api/src/admin-settings, apps/web/src/settings and the iPhone and Mac Settings screens.


