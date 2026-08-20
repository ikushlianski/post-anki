import { type Page } from '@playwright/test';

import { ActionFailure } from '../../lib';
import { clickOnceHydrated } from '../../lib/click-once-hydrated';
import { waitForHydration } from '../../lib/wait-for-hydration';

const ACTION = 'completeCalibrationQuiz';

// Mirrors verification-repo's start-curriculum-level-check.action.ts (which
// only starts the calibration quiz, for scenarios that just need it visible)
// but drives it all the way to completion — this is meant to be run
// standalone from a dev-loop script to actually exercise the probe/gap
// pipeline end to end, not just prove the first question renders.
//
// Navigates to a curriculum's pre-assessment page
// (/curriculum/:id/assess — apps/web/src/routes/curriculum.$curriculumId_.assess.tsx),
// starts the curriculum-wide "quick level check" (probe scope: 'curriculum'),
// then answers every generated question (always picking option 0 — this
// tool doesn't know which answer is "correct," it only proves the pipeline
// runs end to end) until the session reports quiz-complete.
//
// Point OPENROUTER_BASE_URL at e2e-local/mock-openrouter before running this
// for real, or every question-generation call burns a real OpenRouter
// credit.
export interface CompleteCalibrationQuizParams {
  page: Page;
  curriculumId: string;
  maxQuestions?: number;
}

export interface CompleteCalibrationQuizResult {
  answered: number;
  correct: number;
  total: number;
}

export async function completeCalibrationQuiz(
  params: CompleteCalibrationQuizParams,
): Promise<CompleteCalibrationQuizResult> {
  const { page, curriculumId, maxQuestions = 25 } = params;

  await page.goto(`/curriculum/${curriculumId}/assess`);
  await waitForHydration(page);

  const startButton = page.getByTestId('start-level-check');
  const question = page.getByTestId('quiz-question');
  const complete = page.getByTestId('quiz-complete');
  const generateButton = page.getByTestId('generate-quiz');

  if (await startButton.count()) {
    await clickOnceHydrated(startButton);
  }

  try {
    await Promise.race([
      question.waitFor({ state: 'visible', timeout: 15_000 }),
      complete.waitFor({ state: 'visible', timeout: 15_000 }),
      generateButton.waitFor({ state: 'visible', timeout: 15_000 }),
    ]);
  } catch {
    throw ActionFailure.fromMessage(
      `calibration quiz did not render a question, a complete state, or a generate button for curriculum ${curriculumId}`,
      ACTION,
    );
  }

  if (await generateButton.isVisible().catch(() => false)) {
    // ProbeSessionQuiz only mounts once "Take a quick level check" is
    // clicked (a fresh component instance, not the already-hydrated
    // assess-page shell), so its own generate-quiz button needs the same
    // clickOnceHydrated guard as the level-check button above — a plain
    // click landed here often enough to silently no-op (no
    // POST /probe-sessions ever reaching the API) that this isn't optional.
    await clickOnceHydrated(generateButton);
  }

  try {
    await Promise.race([
      question.waitFor({ state: 'visible', timeout: 45_000 }),
      complete.waitFor({ state: 'visible', timeout: 45_000 }),
    ]);
  } catch {
    throw ActionFailure.fromMessage(
      `calibration quiz did not render its first question for curriculum ${curriculumId}`,
      ACTION,
    );
  }

  let answered = 0;
  let correct = 0;
  let total = 0;

  while (answered < maxQuestions) {
    if (await complete.isVisible().catch(() => false)) {
      break;
    }

    if (!(await question.isVisible().catch(() => false))) {
      throw ActionFailure.fromMessage(
        `quiz-question disappeared mid-run without reaching quiz-complete (after ${answered} answered) for curriculum ${curriculumId}`,
        ACTION,
      );
    }

    const option = page.getByTestId('quiz-option-0');
    const submitMulti = page.getByTestId('quiz-submit-multi');

    if (await submitMulti.count()) {
      await clickOnceHydrated(option);
      await clickOnceHydrated(submitMulti);
    } else {
      if (!(await option.count())) {
        throw ActionFailure.missingTestId('quiz-option-0', ACTION);
      }

      await clickOnceHydrated(option);
    }

    try {
      await page.getByTestId('quiz-result').waitFor({ state: 'visible', timeout: 30_000 });
    } catch {
      throw ActionFailure.fromMessage(
        `quiz-result did not appear after answering question ${answered + 1} for curriculum ${curriculumId}`,
        ACTION,
      );
    }

    answered += 1;

    const nextButton = page.getByTestId('quiz-next');

    if (await nextButton.count()) {
      await clickOnceHydrated(nextButton);
    }

    await Promise.race([
      question.waitFor({ state: 'visible', timeout: 15_000 }),
      complete.waitFor({ state: 'visible', timeout: 15_000 }),
    ]).catch(() => undefined);
  }

  if (await complete.isVisible().catch(() => false)) {
    const summary = await complete.innerText();
    const match = summary.match(/(\d+)\/(\d+) correct/);

    if (match) {
      correct = Number(match[1]);
      total = Number(match[2]);
    }
  }

  return { answered, correct, total };
}
