import { expect, test } from '@playwright/test'

import { closeDb, countWhere } from '../../../../lib'
import { openSocraticChat, sendSocraticAnswer } from '../../actions'
import { authHeaders, declareGap, setupConfirmedTopic } from '../../fixtures/mock-data'

const apiPort = process.env.E2E_API_PORT ?? '8031'
const apiBase = `http://localhost:${apiPort}`

test.afterAll(async () => {
  await closeDb()
})

test('@e2e socratic-chat — chat bubbles, typing indicator, and blank-answer re-ask', async ({
  page,
  request,
}) => {
  const stamp = Date.now()
  const { curriculumId, topicId } = await setupConfirmedTopic(stamp)
  // Two gaps: the UI flow resolves the first (correct answer, advances), and
  // the blank-answer API check below needs a second still-open gap to retry
  // against rather than landing on a completed session.
  await declareGap(topicId, `E2E Concept A ${stamp}`)
  await declareGap(topicId, `E2E Concept B ${stamp}`)

  await openSocraticChat({ page, topicId, curriculumId })

  await expect(page.getByTestId('socratic-message-mentor').first()).toBeVisible()

  // The send button mirrors the server's isBlankAnswer bar client-side.
  await sendSocraticAnswer({ page, answer: '   ' })
  await expect(page.getByTestId('socratic-send')).toBeDisabled()

  // A real answer — the stubbed socratic-eval responder returns `correct` by
  // default, so this must advance and show the "holds up" feedback with a
  // visible typing indicator for the duration of the call.
  const sendPromise = sendSocraticAnswer({
    page,
    answer: 'A complete, correct explanation of the concept.',
  })
  await expect(page.getByTestId('socratic-typing-indicator')).toBeVisible({
    timeout: 10_000,
  })
  await sendPromise

  // Two mentor bubbles land after a covered gap: the feedback for the turn
  // just answered, then the next gap's opening prompt — so the feedback is
  // found by its text, not assumed to be the last bubble.
  await expect(
    page.getByTestId('socratic-message-mentor').filter({ hasText: 'Right — that holds up.' }),
  ).toBeVisible()

  // Scoped by concept_label (unique per test run) rather than a bare
  // degree/action pair, so this stays isolated from other tests' turns.
  expect(
    await countWhere('socratic_turns', {
      concept_label: `E2E Concept A ${stamp}`,
      degree: 'correct',
      action: 'advance',
    }),
  ).toBe(1)

  // Server-side blank guard: call the API directly with a whitespace answer
  // (unreachable through the UI, whose send button is disabled for this case)
  // and confirm it retries the same turn without an LLM-scored wrong attempt.
  const startRes = await request.post(`${apiBase}/socratic-sessions`, {
    headers: authHeaders,
    data: { topicId },
  })
  const session = (await startRes.json()) as {
    id: string
    current: { id: string } | null
  }

  expect(session.current, 'a second open gap should still be pending').not.toBeNull()

  const priorTurnCount = await countWhere('socratic_turns', {
    session_id: session.id,
  })

  const answerRes = await request.post(
    `${apiBase}/socratic-sessions/${session.id}/answer`,
    {
      headers: authHeaders,
      data: { turnId: session.current!.id, answer: '   ' },
    },
  )
  const result = (await answerRes.json()) as {
    action: string
    degree: string | null
    next: { id: string } | null
  }

  expect(result.action).toBe('retry')
  expect(result.degree).toBeNull()
  expect(result.next?.id).toBe(session.current!.id)

  const afterTurnCount = await countWhere('socratic_turns', {
    session_id: session.id,
  })
  expect(afterTurnCount).toBe(priorTurnCount)
})
