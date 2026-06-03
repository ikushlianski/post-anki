// Verifies the FE round-trips a gap's `concern` tag end-to-end:
//   declareGap({concern}) -> read it back inline in curriculum detail
//   -> confirm the /cross-cutting rollup for that concern moves +1
//   -> curateGap({concern:null, state:'skipped'}) restores the rollup.
// This closes the last deferred BE capability (concern on user-declared gaps).
import {
  curateGap,
  declareGap,
  getCrossCutting,
  getCurriculumDetail,
  listCurricula,
} from '../src/curriculum/api-client'

const TARGET = 'security' as const

function ok(label: string, cond: boolean, detail?: unknown) {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}`, cond ? '' : JSON.stringify(detail))
  if (!cond) process.exitCode = 1
}

function totalFor(summaries: { concern: string; total: number }[], concern: string) {
  return summaries.find((s) => s.concern === concern)?.total ?? 0
}

async function main() {
  const curricula = await listCurricula()
  const target = curricula.find((c) => c.status === 'confirmed' || c.status === 'ready')
  ok('have a ready/confirmed curriculum', Boolean(target), curricula.map((c) => c.status))
  if (!target) return

  const detail = await getCurriculumDetail(target.id)
  const topic = detail?.modules.flatMap((m) => m.topics).find((t) => t.included)
  ok('found an included topic to attach a gap to', Boolean(topic), detail?.modules.length)
  if (!topic) return

  const before = totalFor(await getCrossCutting(), TARGET)

  const label = `verify-concern ${TARGET} ${Date.now()}`
  await declareGap({ topicId: topic.id, label, concern: TARGET })

  const after = await getCurriculumDetail(target.id)
  const created = after?.modules
    .flatMap((m) => m.topics)
    .flatMap((t) => t.gaps)
    .find((g) => g.label === label)

  ok('declared gap appears inline in curriculum detail', Boolean(created), label)
  ok('inline gap carries the concern tag (FE-mapped)', created?.concern === TARGET, created?.concern)

  const afterTotal = totalFor(await getCrossCutting(), TARGET)
  ok(
    `/cross-cutting rollup for "${TARGET}" moved +1 (user intent counted)`,
    afterTotal === before + 1,
    { before, afterTotal },
  )

  if (created) {
    await curateGap({ gapId: created.id, concern: null, status: 'skipped' })
    const restored = totalFor(await getCrossCutting(), TARGET)
    ok('curate(concern:null) restores the rollup to baseline', restored === before, {
      before,
      restored,
    })
  }

  console.log('\nCONCERN PASSED — declare-with-concern surfaces inline + rolls up, curate clears it.')
}

main().catch((err) => {
  console.error('VERIFY ERROR:', err)
  process.exit(1)
})
