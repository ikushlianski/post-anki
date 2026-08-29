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

// Drives the real curriculum-creation flow via the CreateMaterialForm
// component mounted on the subject detail page. Targets "search" mode: name +
// a documentation URL. This is the actual UI path a user takes to create a
// curriculum from a docs site (the mentor agent then researches + drafts
// structure from that URL).
//
// Point OPENROUTER_BASE_URL at e2e-local/mock-openrouter (see its README)
// before running this against a local API server, or it will burn a real
// OpenRouter call researching the doc URL.
export interface AddCurriculumFromSourceParams {
  page: Page;
  subjectId: string;
  name: string;
  docUrl: string;
  preferredLevel?: 'basic' | 'medium' | 'advanced';
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

  await page.goto(`/subject/${subjectId}`);
  await waitForHydration(page);

  const toggle = page.getByTestId('create-material-toggle');

  if (!(await toggle.count())) {
    throw ActionFailure.missingTestId('create-material-toggle', ACTION);
  }

  await clickOnceHydrated(toggle);

  const form = page.getByTestId('create-material-form');

  try {
    await form.waitFor({ state: 'visible', timeout: 5_000 });
  } catch {
    throw ActionFailure.missingTestId('create-material-form', ACTION);
  }

  const nameInput = form.getByTestId('create-material-name-input');

  if (!(await nameInput.count())) {
    throw ActionFailure.missingTestId('create-material-name-input', ACTION);
  }

  await nameInput.fill(name);

  const searchModeButton = form.getByTestId('create-material-mode-search');

  if (await searchModeButton.count()) {
    await searchModeButton.click();
  }

  const docUrlInput = form.getByTestId('create-material-doc-url-input');

  if (!(await docUrlInput.count())) {
    throw ActionFailure.missingTestId('create-material-doc-url-input', ACTION);
  }

  await docUrlInput.fill(docUrl);
  await expect(docUrlInput).toHaveValue(docUrl);

  if (preferredLevel) {
    const levelSelect = form.getByTestId('create-material-level-select');

    if (await levelSelect.count()) {
      await levelSelect.selectOption(preferredLevel);
    }
  }

  const submit = form.getByTestId('create-material-submit');

  if (!(await submit.count())) {
    throw ActionFailure.missingTestId('create-material-submit', ACTION);
  }

  await submit.click();

  try {
    await page.waitForURL(/\/subject\/[^/]+/, { timeout: 30_000 });
  } catch {
    throw ActionFailure.fromMessage(
      `page did not remain on /subject/:id after submitting the doc URL for "${name}"`,
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
