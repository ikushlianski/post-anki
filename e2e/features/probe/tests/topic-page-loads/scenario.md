# Scenario: dedicated topic page loads with breadcrumb, header, and mode toggle

**Front door:** UI — `/probe/:topicId?mode=quick_test&curriculumId=:id` (the same
route reached by clicking a topic from the curriculum detail page).

**What it proves:** The topic page (`apps/web/src/routes/probe.$topicId.tsx`) is
still an in-place upgrade of the existing "probe room" — breadcrumb, topic
title, and the Quiz/Socratic mode toggle all render exactly as before; only
what each mode renders internally changed (SCENARIO 1 in the app's spec).

**Asserts:**
- UI: the curriculum breadcrumb drawer trigger is visible.
- UI: the topic title text is visible.
- UI: both mode-toggle links ("Socratic", "Quick test") are visible.
- UI: switching mode via the toggle renders the other mode's surface
  (quiz question/complete vs. socratic chat) without a full `page.goto`.
