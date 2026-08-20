import { expect, type Page } from '@playwright/test';

import { ActionFailure } from '../../lib';
import { clickOnceHydrated } from '../../lib/click-once-hydrated';
import { API_BASE_URL, apiAuthHeaders } from '../../lib/env';
import { waitForHydration } from '../../lib/wait-for-hydration';

const ACTION = 'addCurriculumFromSource';

interface ApiCurriculum {
  id: string;
  name: string;
  subjectId: string;
  status: string;
}

// Drives the real "🔎 Study a technology" flow
// (apps/web/src/curriculum/study-technology-form.tsx) in "search" mode: name
// + a documentation URL, no pasted material. This is the actual UI path a
// user takes to create a curriculum from a docs site (the mentor agent then
// researches + drafts structure from that URL) — the same flow
// verification-repo's studyTechnology action drives, ported here because
// this repo now wants to be able to trigger it from a bare dev-loop script
// without going through the full Playwright/BMAD pipeline.
//
// Point OPENROUTER_BASE_URL at e2e-local/mock-openrouter (see its README)
// before running this against a local API server, or it will burn a real
// OpenRouter call researching the doc URL.
export interface AddCurriculumFromSourceParams {
  page: Page;
  subjectId: string;
  name: string;
  docUrl: string;
  preferredLevel?: 'beginner' | 'intermediate' | 'advanced';
}

export interface AddCurriculumFromSourceResult {
  id: string;
  name: string;
  status: string;
}

export async function addCurriculumFromSource(
  params: AddCurriculumFromSourceParams,
): Promise<AddCurriculumFromSourceResult> {
  const { page, subjectId, name, docUrl, preferredLevel } = params;

  await page.goto('/');
  await waitForHydration(page);

  const subjectCard = page.locator(
    `[data-testid="subject-card"][data-subject-id="${subjectId}"]`,
  );

  // The home page's subject list is Electric-synced (live query), not
  // guaranteed present on first paint even after waitForHydration — see
  // docs/memories/local-dev-env.md for the sync stack this depends on. A
  // plain `.count()` right after navigation can race that sync, so wait for
  // visibility with a real timeout instead of asserting immediately.
  try {
    await subjectCard.first().waitFor({ state: 'visible', timeout: 15_000 });
  } catch {
    throw ActionFailure.fromMessage(
      `subject card for subjectId "${subjectId}" was not found on the home page`,
      ACTION,
    );
  }

  const toggle = subjectCard.getByTestId('study-technology-toggle');

  if (!(await toggle.count())) {
    throw ActionFailure.missingTestId('study-technology-toggle', ACTION);
  }

  // The home route's subject cards render before this button's own
  // hydration attaches its onClick — same class of race
  // clickOnceHydrated's own comment documents for the curriculum-detail
  // route. A plain click here is silently dropped often enough to be
  // flaky, not "sometimes slow."
  await clickOnceHydrated(toggle);

  const nameInput = subjectCard.getByTestId('study-technology-name-input');

  try {
    await nameInput.waitFor({ state: 'visible', timeout: 5_000 });
  } catch {
    throw ActionFailure.missingTestId('study-technology-name-input', ACTION);
  }

  await nameInput.fill(name);

  const searchModeButton = subjectCard.getByTestId('study-technology-mode-search');

  if (await searchModeButton.count()) {
    await searchModeButton.click();
  }

  const docUrlInput = subjectCard.getByTestId('study-technology-doc-url-input');

  if (!(await docUrlInput.count())) {
    throw ActionFailure.missingTestId('study-technology-doc-url-input', ACTION);
  }

  await docUrlInput.fill(docUrl);
  await expect(docUrlInput).toHaveValue(docUrl);

  if (preferredLevel) {
    const levelSelect = subjectCard.getByTestId('study-technology-level-select');

    if (await levelSelect.count()) {
      await levelSelect.selectOption(preferredLevel);
    }
  }

  const submit = subjectCard.getByTestId('study-technology-submit');

  if (!(await submit.count())) {
    throw ActionFailure.missingTestId('study-technology-submit', ACTION);
  }

  await submit.click();

  const created = subjectCard.getByTestId('curriculum-name').filter({ hasText: name });

  try {
    await created.first().waitFor({ state: 'visible', timeout: 30_000 });
  } catch {
    throw ActionFailure.fromMessage(
      `curriculum "${name}" did not appear under subject "${subjectId}" after submitting the doc URL`,
      ACTION,
    );
  }

  const res = await fetch(`${API_BASE_URL}/curricula?subjectId=${subjectId}`, {
    headers: apiAuthHeaders(),
  });
  const curricula = (await res.json()) as ApiCurriculum[];
  const match = curricula.find((curriculum) => curriculum.name === name);

  if (!match) {
    throw ActionFailure.fromMessage(
      `curriculum "${name}" was not found via GET /curricula?subjectId=${subjectId} after submit`,
      ACTION,
    );
  }

  return { id: match.id, name: match.name, status: match.status };
}
