import { expect, test } from '@playwright/test'

import { captureProof, closeDb, countWhere, pauseForHuman } from '../../../../lib'
import { studyTechnology } from '../../../curriculum/actions'
import { mockDocsSiteBaseUrl, uniqueTechnologyName } from '../../../curriculum/fixtures/mock-data'

const apiPort = process.env.E2E_API_PORT ?? '8031'
const apiBase = `http://localhost:${apiPort}`
const secret = process.env.API_SHARED_SECRET ?? 'e2e-local-secret'
const authHeaders = {
  authorization: `Bearer ${secret}`,
  'content-type': 'application/json',
}

interface CurriculumSummary {
  id: string
  name: string
  status: string
}

interface DetailModule {
  level: 'basic' | 'medium' | 'advanced' | null
  topics: { included: boolean }[]
}

interface DetailSource {
  kind: string
  value: string
}

interface CurriculumDetail {
  curriculum: { status: string }
  sources: DetailSource[]
  modules: DetailModule[]
}

test.afterAll(async () => {
  await closeDb()
})

test('@e2e study-technology-doc-url — llms.txt grounds research and the picked level pre-selects a tier', async ({
  page,
  request,
}) => {
  const stamp = Date.now()
  const docUrl = mockDocsSiteBaseUrl()

  const subjectRes = await request.post(`${apiBase}/subjects`, {
    headers: authHeaders,
    data: { name: `e2e study-technology subject ${stamp}` },
  })
  expect(subjectRes.status()).toBe(201)
  const subject = (await subjectRes.json()) as { id: string }

  const technologyName = uniqueTechnologyName(stamp)

  await studyTechnology({ page, name: technologyName, docUrl, level: 'medium' })

  let created: CurriculumSummary | undefined

  await expect(async () => {
    const listRes = await request.get(`${apiBase}/curricula?subjectId=${subject.id}`, {
      headers: authHeaders,
    })
    expect(listRes.ok()).toBeTruthy()
    const list = (await listRes.json()) as CurriculumSummary[]

    created = list.find((c) => c.name === technologyName)
    expect(created).toBeTruthy()
  }).toPass({ timeout: 15_000, intervals: [300, 500, 1000] })

  const curriculumId = created!.id

  let detail: CurriculumDetail | undefined

  await expect(async () => {
    const detailRes = await request.get(`${apiBase}/curricula/${curriculumId}`, {
      headers: authHeaders,
    })
    expect(detailRes.ok()).toBeTruthy()
    detail = (await detailRes.json()) as CurriculumDetail

    expect(detail.curriculum.status).toBe('ready')
  }).toPass({ timeout: 30_000, intervals: [500, 1000, 2000] })

  const readyDetail = detail!

  const llmsTxtSource = readyDetail.sources.find((s) => s.kind === 'llms_txt')
  expect(llmsTxtSource).toBeTruthy()
  expect(llmsTxtSource!.value).toBe(docUrl)
  expect(readyDetail.sources.some((s) => s.kind === 'web_research')).toBe(false)

  const mediumModules = readyDetail.modules.filter((m) => m.level === 'medium')
  const otherTierModules = readyDetail.modules.filter(
    (m) => m.level === 'basic' || m.level === 'advanced',
  )

  expect(mediumModules.length).toBeGreaterThan(0)
  for (const m of mediumModules) {
    for (const t of m.topics) {
      expect(t.included).toBe(true)
    }
  }

  expect(otherTierModules.length).toBeGreaterThan(0)
  for (const m of otherTierModules) {
    for (const t of m.topics) {
      expect(t.included).toBe(false)
    }
  }

  expect(await countWhere('sources', { curriculum_id: curriculumId, kind: 'llms_txt' })).toBe(1)

  await page.goto(`/curriculum/${curriculumId}`)
  await expect(page.getByTestId('source-row-llms-txt')).toBeVisible()

  await captureProof({
    page,
    testId: 'source-row-llms-txt',
    path: 'e2e/proof/curriculum/study-technology-doc-url.png',
  })
  await pauseForHuman({ page })
})
