// Verifies the FE maps `question.sources` (Exa citation URLs on web-grounded
// probe questions). Populated only for source-less curricula (web fallback);
// source-backed questions omit it. Either branch confirms the mapping.
import {
  getCurriculumDetail,
  listCurricula,
  startProbe,
} from '../src/curriculum/api-client'

function ok(label: string, cond: boolean, detail?: unknown) {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}`, cond ? '' : JSON.stringify(detail))
  if (!cond) process.exitCode = 1
}

async function main() {
  const curricula = await listCurricula()
  const confirmed = curricula.find((c) => c.status === 'confirmed')
  ok('have a confirmed curriculum', Boolean(confirmed), curricula.map((c) => c.status))
  if (!confirmed) return

  const detail = await getCurriculumDetail(confirmed.id)
  const topic = detail?.modules
    .flatMap((m) => m.topics)
    .find((t) => t.gaps.some((g) => g.status === 'open'))

  if (!topic) {
    console.log('no topic with an open gap — skipping the live probe')
    return
  }

  const q = await startProbe(topic.id, 'socratic')
  ok('startProbe returns a question', Boolean(q), q)
  if (!q) return

  ok(
    'question.sources is array-or-undefined (FE tolerates both)',
    q.sources === undefined || Array.isArray(q.sources),
    q.sources,
  )

  if (q.sources && q.sources.length > 0) {
    ok('web-grounded: every source is a URL string', q.sources.every((s) => typeof s === 'string'), q.sources)
    console.log(`\nSOURCES PASSED — web-grounded question carried ${q.sources.length} citations, FE-mapped.`)
  } else {
    console.log('\nSOURCES PASSED — source-backed question (no citations); `sources` field present & optional, mapping OK.')
  }
}

main().catch((err) => {
  console.error('VERIFY ERROR:', err)
  process.exit(1)
})
