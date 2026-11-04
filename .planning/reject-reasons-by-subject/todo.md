# Rejection reasons by subject type
## reject-reasons

### Scope
- The reasons offered when rejecting a card depend on the card's subject type, for example programming, languages, business and everything else.
- Out of scope: Removing or renaming reason codes already stored on past rejections.

### Goal
- When the owner rejects a card, the reason list matches what can go wrong in that kind of subject, on web, iPhone and Mac.

### Criteria
- [ ] A programming card offers reasons about wrong or outdated code, too trivial syntax recall and missing version
- [ ] A language card offers reasons about unnatural phrasing, wrong register, wrong translation and wrong language
- [ ] Other subjects keep a general list
- [ ] Old stored reason codes still display and count in statistics
- [ ] Reject reason statistics can be split by subject type

### Coding tasks
- [x] Use the card's rejectReasonCodes and the statistics bySubjectType list in the iPhone and Mac reject sheets and Statistics screens.
  - Why: The web already uses them; native screens still show one fixed list.
- [x] Make the web triage decisions list show the reject reasons for the card's subject type, which needs the subject type added to that list's data.
  - Why: It still shows the old seven reasons, so the new language reason is missing there.
- [x] Add a language-card reject reason for a front that does not make it clear which phrase the answer should be, since the owner says this is the cause of most rejections.
  - Why: It is the owner's main complaint and no current reason names it.
- [ ] Split the reject reason statistics by subject type on the web and iPhone Statistics screens.
  - Why: Reasons from different subject types should not be mixed into one count.
- [ ] Show the matching reason list in the reject sheet on web, iPhone and Mac, based on the card's subject.
  - Why: The owner picks the reason at the moment of rejecting.
- [x] Let the API work out a card's subject type from its subject, including a programming type, and accept only reasons from that type's list while still accepting old codes.
  - Why: Today only business, language and other exist.
- [x] Define a reason list for each subject type (programming, language, business, other) in the shared package, keeping every existing reason code valid and giving each new reason a stable code and a plain label.
  - Why: The current single list fits none of them well.

### Notes


