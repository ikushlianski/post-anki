import { type Page } from '@playwright/test';

import { ActionFailure } from '../../lib';
import { API_BASE_URL, apiAuthHeaders } from '../../lib/env';
import { waitForHydration } from '../../lib/wait-for-hydration';

const ACTION = 'createSubject';

// Pre-condition action: add-curriculum-from-source (and most other flows)
// need an existing subject to hang a curriculum off. Drives the real
// CreateSubjectForm (data-testid="subject-create-form" — see
// apps/web/src/subject/create-subject-form.tsx) at its actual route,
// /subjects/new (apps/web/src/routes/subjects.new.tsx) — NOT the home page;
// a stale comment in routes/index.tsx still references CreateSubjectForm
// but it isn't rendered there, only at /subjects/new. Submitting navigates
// straight to /subject/$subjectId/map, so the created card never needs to
// appear on the home page for this action to consider its job done.
export interface CreateSubjectParams {
  page: Page;
  name: string;
  description?: string;
}

export interface CreateSubjectResult {
  id: string;
  name: string;
}

interface ApiSubject {
  id: string;
  name: string;
}

export async function createSubject(
  params: CreateSubjectParams,
): Promise<CreateSubjectResult> {
  const { page, name, description } = params;

  await page.goto('/subjects/new');
  await waitForHydration(page);

  const nameInput = page.getByTestId('subject-name-input');

  if (!(await nameInput.count())) {
    throw ActionFailure.missingTestId('subject-name-input', ACTION);
  }

  await nameInput.fill(name);

  if (description) {
    const descriptionInput = page.getByTestId('subject-description-input');

    if (await descriptionInput.count()) {
      await descriptionInput.fill(description);
    }
  }

  const addButton = page.getByTestId('subject-add-button');

  if (!(await addButton.count())) {
    throw ActionFailure.missingTestId('subject-add-button', ACTION);
  }

  // Plain click, not clickOnceHydrated: this is a type="submit" button whose
  // handler is the <form>'s onSubmit, not an onClick prop on the button
  // itself, so the React-props-key poll clickOnceHydrated relies on (see
  // its own comment) never resolves here. waitForHydration above is enough
  // — this route has no code-split chunk of its own beyond the root router.
  await addButton.click();

  try {
    await page.waitForURL(/\/subject\/[^/]+\/map/, { timeout: 15_000 });
  } catch {
    throw ActionFailure.fromMessage(
      `submitting the subject-create-form did not navigate to /subject/:id/map for "${name}"`,
      ACTION,
    );
  }

  const match = /\/subject\/([^/]+)\/map/.exec(page.url());
  const subjectIdFromUrl = match?.[1];

  if (subjectIdFromUrl) {
    return { id: subjectIdFromUrl, name };
  }

  const res = await fetch(`${API_BASE_URL}/subjects`, { headers: apiAuthHeaders() });
  const subjects = (await res.json()) as ApiSubject[];
  const found = subjects.find((subject) => subject.name === name);

  if (!found) {
    throw ActionFailure.fromMessage(
      `subject "${name}" was not found via GET /subjects after submit`,
      ACTION,
    );
  }

  return { id: found.id, name: found.name };
}
