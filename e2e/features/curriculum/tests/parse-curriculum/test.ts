import { expect, test } from '@playwright/test'

import { closeDb, countWhere } from '../../../../lib'
import { CURRICULUM_STUB_PLAN } from '../../../../mock-openrouter/responses'

const apiPort = process.env.E2E_API_PORT ?? '8031'
const apiBase = `http://localhost:${apiPort}`
const secret = process.env.API_SHARED_SECRET ?? 'e2e-local-secret'
const authHeaders = {
  authorization: `Bearer ${secret}`,
  'content-type': 'application/json',
}

test.afterAll(async () => {
  await closeDb()
})

test('@e2e curriculum-parse — pasted source is parsed into modules via the stubbed architect', async ({
  request,
}) => {
  const stamp = Date.now()

  const subjectRes = await request.post(`${apiBase}/subjects`, {
    headers: authHeaders,
    data: { name: `e2e parse subject ${stamp}` },
  })
  expect(subjectRes.status()).toBe(201)
  const subject = (await subjectRes.json()) as { id: string }

  const createRes = await request.post(`${apiBase}/curricula`, {
    headers: authHeaders,
    data: {
      subjectId: subject.id,
      name: `e2e stubbed curriculum ${stamp}`,
      sources: [
        {
          kind: 'text',
          value:
            'Service boundaries, data ownership, and the tradeoffs of splitting a monolith into services. '.repeat(
              4,
            ),
        },
      ],
    },
  })
  expect(createRes.status()).toBe(202)
  const curriculum = (await createRes.json()) as { id: string }

  const expectedTitles = CURRICULUM_STUB_PLAN.modules.map((m) => m.title)

  await expect(async () => {
    const detailRes = await request.get(`${apiBase}/curricula/${curriculum.id}`, {
      headers: authHeaders,
    })
    expect(detailRes.ok()).toBeTruthy()

    const detail = (await detailRes.json()) as {
      curriculum: { status: string }
      modules: { title: string }[]
    }

    expect(detail.curriculum.status).toBe('ready')
    expect(detail.modules.map((m) => m.title)).toEqual(
      expect.arrayContaining(expectedTitles),
    )
  }).toPass({ timeout: 30_000, intervals: [500, 1000, 2000] })

  expect(await countWhere('modules', { curriculum_id: curriculum.id })).toBe(
    expectedTitles.length,
  )
})
