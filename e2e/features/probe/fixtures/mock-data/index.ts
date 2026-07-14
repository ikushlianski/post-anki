const apiPort = process.env.E2E_API_PORT ?? '8031'
const apiBase = `http://localhost:${apiPort}`
const secret = process.env.API_SHARED_SECRET ?? 'e2e-local-secret'

export const authHeaders = {
  authorization: `Bearer ${secret}`,
  'content-type': 'application/json',
}

export interface ConfirmedTopic {
  curriculumId: string
  topicId: string
}

// Creates a subject + a pasted-source curriculum (parsed by the stubbed
// curriculum-architect into CURRICULUM_STUB_PLAN's single topic), waits for
// it to reach `ready`, and confirms it — the confirmed state the probe-session
// and socratic services require before they'll generate anything. Uses plain
// fetch (not the Playwright `request` fixture) since it's shared setup called
// from several test files, independent of any single test's fixtures.
export async function setupConfirmedTopic(stamp: number): Promise<ConfirmedTopic> {
  const subjectRes = await fetch(`${apiBase}/subjects`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ name: `e2e probe subject ${stamp}` }),
  })
  const subject = (await subjectRes.json()) as { id: string }

  const createRes = await fetch(`${apiBase}/curricula`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      subjectId: subject.id,
      name: `e2e probe curriculum ${stamp}`,
      sources: [
        {
          kind: 'text',
          value:
            'Service boundaries, data ownership, and the tradeoffs of splitting a monolith into services. '.repeat(
              4,
            ),
        },
      ],
    }),
  })
  const curriculum = (await createRes.json()) as { id: string }

  let topicId: string | null = null

  for (let attempt = 0; attempt < 20; attempt += 1) {
    const detailRes = await fetch(`${apiBase}/curricula/${curriculum.id}`, {
      headers: authHeaders,
    })
    const detail = (await detailRes.json()) as {
      curriculum: { status: string }
      modules: { topics: { id: string }[] }[]
    }

    if (detail.curriculum.status === 'ready') {
      topicId = detail.modules.flatMap((m) => m.topics)[0]?.id ?? null
      break
    }

    await new Promise((resolve) => setTimeout(resolve, 500))
  }

  if (!topicId) {
    throw new Error(`curriculum ${curriculum.id} never reached ready with a topic`)
  }

  await fetch(`${apiBase}/curricula/${curriculum.id}/confirm`, {
    method: 'POST',
    headers: authHeaders,
  })

  return { curriculumId: curriculum.id, topicId }
}

export async function declareGap(topicId: string, label: string): Promise<string> {
  const res = await fetch(`${apiBase}/gaps`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ topicId, label }),
  })
  const gap = (await res.json()) as { id: string }

  return gap.id
}
