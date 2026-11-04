# Add knowledge page UI audit 1

Method: code audit only. The e2e stack on :5550 was not running (curl returned 000), so nothing was loaded in a browser. :5540 and :5562 were not touched.
Sizing note: styles.css:18-19 sets `--spacing: 0.22rem` and `--text-xs/sm` to 13/15px. All px estimates below use that scale (Tailwind size N = N x 3.52px), not the default 4px.
Labels: Fact = read in code (file:line). Assumption = browser or layout behaviour I inferred but did not observe.
Paths are under /Users/ikushlianski/webdata/ilya-projects/post-anki/apps/web/src/.

## High

H1. Phone: the suggested model's name is crushed in the dropdown.
- Symptom: on a 375px phone the Model list shows "GPT-6 L..." or similar, and the "Suggested" badge squeezes the name further.
- Component: ui/searchable-select.tsx, model option rows.
- Mechanism (Fact): the price detail "$0.10 in / $0.40 out per 1M" is `shrink-0` (searchable-select.tsx:240) and the badge is `shrink-0` (:228). Only the label is `truncate` (:226). The popover is capped at calc(100vw-2rem) (:35). The detail text is about 28 characters at 13px, which is about 180px (Assumption on exact width), so little width remains for the name.
- Fix: stack price under the name on narrow widths (`flex-col sm:flex-row`), or put the price in the second line next to the note.

H2. Keyboard: a subject cannot be cleared, and Enter on an empty field silently picks the first subject.
- Symptom: a keyboard user deletes the subject text and presses Tab, and the old subject comes back. If they press Enter instead, the first alphabetical subject is selected, not "No subject".
- Component: ui/searchable-select.tsx onKeyDown/onBlur.
- Mechanism: Tab calls `close()`, which sets query to null (:134-136). The clear-on-blur check needs `query !== null` (:140). Per the React flush order I expect `query` to be null by the time onBlur runs (Assumption on timing). Enter with an empty query runs `choose(visible[0])` (:120-126, active reset to 0 at :168). There is no clear button, so only click-away clears (Fact for the code paths).
- Fix: add an explicit "No subject" first option, or a clear button. Handle the empty-query case in onKeyDown (Enter or Tab with an empty query and clearable commits '').

H3. The dropdown row is not scrolled to the active item.
- Symptom: with arrow keys in a long subject or model list (max-h-72), the highlighted row moves out of view.
- Component: ui/searchable-select.tsx.
- Mechanism (Fact): there is no scrollIntoView or ref for the active option anywhere in the file (:109-137, :211-223). The list is `overflow-auto` at :35.
- Fix: call `scrollIntoView({block:'nearest'})` on the active option in an effect on `active`.

## Medium

M1. At 768-1100px the two columns are cramped and long subject paths are cut at the end.
- Symptom: the leaf name of a nested path, which is the part that matters, is clipped in the closed field. A text input has no ellipsis and no tooltip.
- Component: add-knowledge-form.tsx grid, ui/searchable-select.tsx field.
- Mechanism: `sm:grid-cols-2` applies at 640px (add-knowledge-form.tsx:118), but the 225px sidebar appears at md (__root.tsx:117, md:w-64 = 225px). At 768px the width is about 768-225-56 (sm:pr-16, :121)-56 (px-8) = about 430px, so each column is about 210px. Text width is about 168px after pl-3/pr-9 (searchable-select.tsx:32). The full path appears only in "Adding to:" (add-knowledge-form.tsx:154-156). The widths are an estimate (Assumption).
- Fix: use `lg:grid-cols-2` (stack until lg), and set `title={selectedLabel}` on the input.

M2. Model popover can run off the right edge on mid-width screens.
- Symptom: the right-column dropdown is cut off or causes horizontal scroll at about 640-1100px.
- Component: ui/searchable-select.tsx POPOVER_CLASS.
- Mechanism: it is anchored `left-0` with `w-max` and a max of 30rem (480px) (:35). `max-w` limits width, not position, and there is no right-edge flip. At a 1024px viewport the right column starts at about x=600, so 600+480 > 1024 (Assumption). Model rows are about 420px wide (see H1).
- Fix: right-align the popover for the second column (`right-0 left-auto`) or pass an `align` prop. Alternatively, stack the fields until lg (M1).

M3. Model quality notes are not visible where the user chooses.
- Symptom: options show only price and "Retires...". Warnings like "Weak Russian coverage" and "Unstable on English" appear only after selecting, below the field.
- Component: extraction-model-select.tsx.
- Mechanism (Fact): `buildModelSearchOptions` sets `note` only to "Retires <date>" (:44). The real note renders only for the selected model (:91). For a user who pastes Russian text, this is the key decision input.
- Fix: show a trimmed `note` as the second line of each option (it already `truncate`s), with the full text in `title`.

M4. Typing to change an already-selected value appends to the old text.
- Symptom: with "Programming > TypeScript" selected, typing "java" yields "Programming > TypeScriptjava" and "No subject matches". The user must delete the text by hand first. Same for a preselected Model.
- Component: ui/searchable-select.tsx.
- Mechanism (Fact): the input shows `query ?? selected.label` (:165) and onChange stores the whole value (:166-170). There is no select-all on focus or click (no onFocus handler).
- Fix: add `onFocus={e => e.currentTarget.select()}`.

M5. The Model field does not say it is optional, and the user cannot go back to "no choice".
- Symptom: the placeholder "Choose a model" reads as required (add-knowledge-form.tsx:139). Once a model is picked or auto-suggested, no control resets it to "cheapest". The hint "Not chosen: the cheapest model..." appears only when no suggestion exists.
- Component: add-knowledge-form.tsx, extraction-model-select.tsx.
- Mechanism (Fact): the label is just "Model" (:135). `clearable` is not passed for the model, so blur never clears (searchable-select.tsx:140). `usePreselectedModel` makes chosen ?? suggested (use-model-suggestion.ts:49-52).
- Fix: label "Model (optional)", a placeholder like "Cheapest (<name>)", and `clearable`.

M6. Model suggestion causes layout shift, with no loading state.
- Symptom: first paint shows "Not chosen: cheapest model..." and the empty field. When the suggestion arrives, the field fills in, the hint disappears and a long note appears, so the content below jumps. A failed fetch is silent.
- Component: use-model-suggestion.ts, add-knowledge-form.tsx.
- Mechanism (Fact): there is no loading flag (use-model-suggestion.ts:17-41). The hint is conditional on `modelId === ''` (add-knowledge-form.tsx:146). The note is conditional on `selected` (extraction-model-select.tsx:91).
- Fix: expose a `loading` state and reserve a fixed-height hint line (`min-h`) or show a skeleton. The user may also type during the swap, and the swap only applies if they have not chosen yet, so the chosen/suggested logic is safe.

M7. Subjects not loaded, or empty, shows the same message as "no match".
- Symptom: before the live query resolves, or if parents are filtered out, the list says "No subject matches". A parent subject typed in is silently missing (parents are hidden unless "More options" > "Also allow parent subjects").
- Component: add-knowledge-form.tsx, use-knowledge-subject-choice.ts, ui/subject-combobox.tsx.
- Mechanism (Fact): `useLiveQuery` data is used as `?? []` with no isLoading check (add-knowledge-form.tsx:25-26). The empty text is fixed (subject-combobox.tsx:21). Parents are filtered at use-knowledge-subject-choice.ts:39. If `initialSubjectId` is in the URL before subjects load, "Adding to: No subject" shows and then flips.
- Fix: pass `loading`/`emptyText` ("Loading subjects..." / "No subjects yet" / "Parent subjects are hidden. Turn on More options to include them").

M8. Phone: the paste box, the page's main task, sits below roughly 6 blocks of metadata, and autofocus pops the keyboard over Subject, Model and the submit button.
- Symptom: header + title + subtitle + Subject + Model + hint + "Adding to" + 44px "More options" is about 400px before the textarea starts. Autofocus on load opens the soft keyboard, which hides the pickers above it. The submit button is below the fold.
- Component: add-knowledge-form.tsx:117-198, knowledge-block-field.tsx:40-44.
- Mechanism: `focusOnMount` runs unconditionally for block 0. The pixel sums are an estimate (Assumption).
- Fix: autofocus only when `matchMedia('(pointer: fine)')`. Merge "Adding to" into the subject field (it duplicates the combobox value). Move "More options" next to the Subject field.

M9. Block numbers in error messages never appear on screen.
- Symptom: "Blocks 1, 2 could not be added" refers to numbers the user cannot see. With several blocks there is no visible separation or numbering, just stacked textareas.
- Component: knowledge-block-field.tsx, submit-knowledge-blocks.ts.
- Mechanism (Fact): numbering exists only in aria-labels (knowledge-block-field.tsx:48, :74). The message text is built at submit-knowledge-blocks.ts:37-45. After a partial failure, successful blocks are removed and the rest renumbered (add-knowledge-form.tsx:102-108), so the numbers shift under the user.
- Fix: render a visible "Block N" caption per block, or drop the numbers from the global message and rely on the per-block errors.

M10. Partial success shows green and red messages together, with the order and live-region semantics wrong.
- Symptom: success text with the "Approve suggestions" button appears first. The red failure line appears below it, with no screen-reader announcement. The failure text stays after the user edits the block (block errors clear on edit, the global one does not).
- Component: add-knowledge-form.tsx:200-210.
- Mechanism (Fact): the error `<p>` has no `role="alert"` (:206-210) while block-level errors do (knowledge-block-field.tsx:104, :110). `error` is cleared only in submit (:84). The success copy says "Approve them on the next screen" (:96) but there is no navigation, only a link.
- Fix: put the error above the success, add role="alert", clear it on any block edit, and change the copy to "Use Approve suggestions below".

M11. Native URL validation pre-empts the app's own messages.
- Symptom: typing "example.com" into the link box and submitting shows the browser's "Please enter a URL" bubble, not the app's "Start it with https://". A bad link in block 2 also blocks submitting valid text in block 1.
- Component: knowledge-block-field.tsx:86 (`type="url"`), form at add-knowledge-form.tsx:117.
- Mechanism (Fact): the form has no `noValidate`.
- Fix: add `noValidate` and validate in app code, or keep the native check and drop the duplicate copy.

## Low

L1. After submit, focus is lost and not returned.
- Fact: the textarea is `disabled` while busy (knowledge-block-field.tsx:76), which drops focus. Block 0 keeps `key={index}` and `focusOnMount` never re-fires (add-knowledge-form.tsx:167, :171; the effect depends only on `focusOnMount`, :40-44).
- Fix: refocus block 0 after success.

L2. Whole form dims at once while saving.
- Fact: every control has `disabled:opacity-50`, including the pasted text (knowledge-block-field.tsx:81). The submit button is also faded when empty, with no hint why (add-knowledge-form.tsx:185).
- Fix: use `readOnly` on the textarea while busy, and show a hint such as "Paste text to continue".

L3. Placeholder contrast is low.
- Assumption: Tailwind v4 preflight draws placeholders at 50% of the current text colour. On text-neutral-900 over white that is about 3.4:1, under the 4.5:1 target, and it affects "No subject — type to search" and "Paste a block of prose..." (searchable-select.tsx:164; knowledge-block-field.tsx:78). Retired options use text-neutral-400, about 2.5:1 (:63); this is allowed for disabled items.
- Fix: `placeholder:text-neutral-500`.

L4. Grey helper text is on the pass line.
- Fact: text-neutral-500 (#737373) at 13px is used for helper lines (add-knowledge-form.tsx:147, :154; knowledge-block-field.tsx:98). Computed contrast is about 4.5-4.7:1 on white and neutral-50.
- Fix: use text-neutral-600 for hints.

L5. Tap targets under 44px.
- Fact: "Back to ..." link has no padding or min-height (knowledge-add-success.tsx:29). On tablets (>=640px), `sm:min-h-0` shrinks the toggles, Remove button, More options button and combobox to about 36px (searchable-select.tsx:32; knowledge-block-field.tsx:10-11, :122; knowledge-more-options.tsx:29).
- Fix: gate the shrink on `pointer-fine`, or use `md:` instead of `sm:`.

L6. A text input shows a pointer cursor.
- Fact: FIELD_CLASS has `cursor-pointer` (searchable-select.tsx:32), which is wrong for a field you type into.
- Fix: `cursor-text`.

L7. Listbox semantics are incomplete.
- Fact: group headings are plain divs, not `role="group"` with a label (searchable-select.tsx:206-210). The popover `ul` repeats the input's `aria-label` (:188). The hint lines (model hint, parent hint) are not linked with `aria-describedby`. The `<label>` wraps both the input and the whole popover and note, so clicking the note text re-opens the list (add-knowledge-form.tsx:119-145; the ul's `onClick preventDefault` at searchable-select.tsx:191 is a mitigation).
- Fix: use `role="group"` with `aria-labelledby`, add `aria-describedby`, and use `htmlFor`/`id` instead of wrapping.

L8. "More options" can collapse under the user.
- Assumption: with `parentHintName` set, the region is forced open. If the user checks then unchecks "Also allow parent subjects", `forcedOpen` flips to false while `expanded` is still false (knowledge-more-options.tsx:17-18, :22), so the checkbox the user just clicked is hidden and focus is lost.
- Fix: set `expanded` to true when it is first forced open.

L9. Number formatting is inconsistent.
- Fact: the counter uses `toLocaleString('en-US')` (knowledge-block-field.tsx:99) and the over-limit alert uses `toLocaleString()` (:105). A Russian-locale browser shows "12 345" in one place and "12,345" in the other.
- Fix: use one formatter.

L10. Minor layout and weight issues.
- Fact: the empty `role="status"` div still gets `space-y-3` top margin, a phantom 10px gap (knowledge-add-success.tsx:11). The "Source type" toggles have no border, so they read as loose text (knowledge-block-field.tsx:10-11). Field labels use the same size and weight as the field text (add-knowledge-form.tsx:119-120). The green and red message colours use ad hoc classes, not the `.alert-success` / `.alert-error` classes in styles.css (:44-55). Content has `sm:pr-16` (56px) right padding that makes tablet margins asymmetric (__root.tsx:121).
- Fix: use `font-medium` on labels and the shared alert classes, and render nothing instead of an empty live region wrapper (or move `space-y` off it).

## Checked and OK (no finding)
- The header is not sticky (__root.tsx:78). There is no sticky header to clip the popover (Fact). The popover is z-30, the header search is z-50 and the chat button is z-20, so the popover sits above the chat button. The mobile drawer is also z-30/40 but cannot be open at the same time.
- No ancestor has `overflow-hidden`, so the popover is not clipped by `main` (Fact).
- Enter in the combobox is `preventDefault`ed, so it does not submit the form (searchable-select.tsx:121).
- Option rows are 44px on phones. The submit button is full-width and 44px on phones.
- The empty success `role="status"` region exists before content is added, so announcements work.
- Per-block errors use `role="alert"`.

END-OF-REPORT
