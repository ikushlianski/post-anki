export const MODEL_NOTES = `
**What this compares:** three ways to pick the model that parses new knowledge. All of them start empty (no model is chosen for you) and show the price per 1M tokens.

**A. Plain select + price line.** Looks like every other select in the app. The option list stays short and readable; the price and a one-line note appear under the field once a model is chosen.
- Good: smallest change (the look already exists), native keyboard and phone picker, no new code to maintain.
- Weak: you cannot compare prices while the list is open.
- Cost to adopt: one file (the model select component), no new dependency.

**B. Grouped select, price in every option.** The same native select, but options are grouped by vendor and each option reads "Label · $in / $out".
- Good: prices are visible when comparing, still a native control (best on phones).
- Weak: longer option text; the note line is gone.
- Cost to adopt: one file, no new dependency.

**C. Custom list with a price column.** A popover list with the name on the left and the price on the right, plus a small note under the name.
- Good: the best comparison view, room for notes and badges (suggested, retires on a date).
- Weak: hand-built control: more code and more accessibility work; on phones it is not the native picker.
- Cost to adopt: new component plus tests, no dependency (a headless library such as Radix or Downshift would shorten it, but that would be a new dependency).
`

export const SUBJECT_NOTES = `
**What this compares:** three ways to pick the subject. Subjects that have sub-subjects are hidden by default so knowledge goes to leaf subjects; the checkbox "Also allow parent subjects" brings them back.

**A. Grouped select.** One native select: top-level leaves first, then one group per parent with its sub-subjects. Parents are group headings, so they cannot be picked by accident.
- Good: familiar, native on phones, zero typing needed, hierarchy visible at a glance.
- Weak: no search; with many subjects the list gets long.
- Cost to adopt: replace the subject combobox in the add-knowledge form, no new dependency.

**B. Searchable list.** Type to filter; matches show the path ("Business › Sales"); arrows, Enter and Escape work.
- Good: fastest when you know the name, works for hundreds of subjects.
- Weak: hand-built control (more code and tests); on phones it opens the on-screen keyboard.
- Cost to adopt: new component plus tests, no dependency (a headless combobox library would shorten it).

**C. Two steps.** First the top-level subject, then a second select appears with its sub-subjects. Top-level leaves finish in one step.
- Good: matches "click the parent to open its children"; each list is short.
- Weak: two taps for most choices; the form layout shifts when the second select appears.
- Cost to adopt: new small component, no dependency.
`
