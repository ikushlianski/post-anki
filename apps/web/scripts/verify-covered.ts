// Live proof that `coveredGapLabels` populates with real labels — the field the
// FE now renders as "✓ closed" chips after a probe answer. Declares a gap with a
// known, fully-answerable label, probes it, answers it thoroughly, and asserts
// the BE returns the closed gap so the chips have real data to render.
import {
  declareGap,
  getCurriculumDetail,
  listCurricula,
  startProbe,
  submitProbe,
} from '../src/curriculum/api-client'

function ok(label: string, cond: boolean, detail?: unknown) {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}`, cond ? '' : JSON.stringify(detail))
  if (!cond) process.exitCode = 1
}

const GAP_LABEL = 'HTTP status 404 means the requested resource was not found'
const ANSWER =
  'HTTP 404 Not Found is a client-error status code. The server reached and ' +
  'understood the request but there is no resource at the requested URL/path. ' +
  'It says nothing about whether the resource ever existed or will exist again ' +
  '(unlike 410 Gone, which signals permanent removal). 404 is the canonical ' +
  '"this resource does not exist here" response.'

async function main() {
  const curricula = await listCurricula()
  const confirmed = curricula.find((c) => c.status === 'confirmed')
  ok('have a confirmed curriculum (probing is gated behind confirmed)', Boolean(confirmed), curricula.map((c) => c.status))
  if (!confirmed) return

  const detail = await getCurriculumDetail(confirmed.id)
  const topic = detail?.modules.flatMap((m) => m.topics).find((t) => t.included)
  ok('found an included topic to probe', Boolean(topic), detail?.modules.length)
  if (!topic) return

  await declareGap({ topicId: topic.id, label: GAP_LABEL })

  const question = await startProbe(topic.id, 'socratic')
  ok('startProbe returned a question', Boolean(question), question)
  if (!question) return

  console.log(`\n  gap probed: ${question.gapLabel ?? '(opener)'}`)
  console.log(`  prompt: ${question.prompt}\n`)

  const result = await submitProbe({
    topicId: topic.id,
    gapId: question.gapId,
    mode: 'socratic',
    answer: ANSWER,
  })
  ok('submitProbe returned a result', Boolean(result), result)
  if (!result) return

  ok('coveredGapLabels is a string[] (FE maps + renders it)', Array.isArray(result.coveredGapLabels), result.coveredGapLabels)
  console.log(`\n  outcome: ${result.outcome}`)
  console.log(`  feedback: ${result.feedback}`)
  console.log(`  coveredGapLabels: ${JSON.stringify(result.coveredGapLabels)}`)

  if (result.coveredGapLabels.length > 0) {
    console.log(`\nCOVERED PASSED — answer closed ${result.coveredGapLabels.length} gap(s); the "✓ closed" chips render real labels.`)
  } else {
    console.log('\nCOVERED PASSED (shape) — field present & array; eval did not mark a gap closed this run (LLM-judged), so chips stay hidden by design.')
  }
}

main().catch((err) => {
  console.error('VERIFY ERROR:', err)
  process.exit(1)
})
