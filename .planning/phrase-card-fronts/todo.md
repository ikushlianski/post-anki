# Phrase card fronts
## phrase-fronts

### Scope
- Cards made from the owner's written-down English phrases show a front that points to exactly one right answer.
- Out of scope: Cards from non-language subjects.

### Goal
- Looking only at the front of a phrase card, the owner knows which phrase to produce.

### Criteria
- [ ] The front shows a sentence with the phrase blanked out plus its Russian translation
- [ ] The blank shows the number of words or the first letter of the phrase
- [ ] A sentence that fits several different phrases is not offered as a card
- [ ] Each phrase gets several front wordings: a Russian translation, another Russian wording and a short English explanation at B1 to B2 level
- [ ] During triage the owner sees the wordings side by side and picks which to keep

### Coding tasks
- [ ] Make the Russian line on a phrase card translate the meaning of the hidden chunk, not the whole sentence, and show the choice-among-variants step before the typed-recall step for new phrases.
  - Why: Whole-sentence translation has many correct renderings, so the owner cannot tell if the recalled phrase is the intended one.
- [ ] Keep the blanked part of a phrase card to the short core chunk of two to four words and drop first-letter hints for anything longer than two hidden words, so a long phrase like a nine-word tail is never blanked as one gap.
  - Why: A nine-word blank with letter hints is a puzzle with many valid answers, not something the owner can recall.
- [x] Make the hidden part grow as a phrase is learned, starting with most words visible and ending with the whole phrase blanked, using the card's review history to decide the step.
  - Why: Easier first reviews build recall, and the full blank later tests real production.
- [x] Let a phrase card front show the target sentence with only part of the phrase hidden, for example the first word kept and the rest blanked, so the owner can reach the phrase from the visible words and the Russian translation.
  - Why: A scene description such as a manager showing a slide gave no clue that the answer was 'or am I making it up?'.
- [ ] Show these front wordings as choices in triage on web, iPhone and Mac, reusing the existing sentence variant picker, and keep only the wordings the owner selects.
  - Why: The owner decides which wording is clear enough to study.
- [x] Generate for every phrase several front wordings, each short: the Russian translation, a different Russian wording and a plain English explanation written the way a B1 to B2 speaker would put it, none of them containing the phrase.
  - Why: One wording can mislead, so the owner wants to compare several.
- [ ] Have the generator check that the blanked sentence could not be completed by another common phrase, and drop or rewrite sentences that fail.
  - Why: A vague sentence is the main reason the answer cannot be guessed.
- [x] Make phrase cards show an English sentence with the target phrase blanked out, a Russian translation of the whole sentence and a hint with the first letters, instead of only a Russian meaning and a synonym.
  - Why: The blank plus the translation leaves one natural answer, which a bare meaning does not.

### Notes
- Shares the triage screens with model-fusion's fusion-triage, so build after it or merge the two pickers.


