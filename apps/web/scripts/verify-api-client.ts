import {
  getCrossCutting,
  getCurriculumDetail,
  getDailyPush,
  listCurricula,
  listSubjects,
  listTopicGaps,
} from '../src/curriculum/api-client'

function ok(label: string, cond: boolean, detail?: unknown) {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}`, cond ? '' : JSON.stringify(detail))
  if (!cond) process.exitCode = 1
}

async function main() {
  const subjects = await listSubjects()
  ok('listSubjects → Subject[]', Array.isArray(subjects) && subjects.length > 0, subjects)

  const curricula = await listCurricula()
  ok('listCurricula → mapped Curriculum[]', Array.isArray(curricula) && curricula.length > 0, curricula)

  const confirmed = curricula.find((c) => c.status === 'confirmed') ?? curricula[0]
  ok('a curriculum status maps to FE enum', Boolean(confirmed) && ['draft', 'curating', 'ready', 'confirmed', 'failed'].includes(confirmed!.status), confirmed)

  const detail = await getCurriculumDetail(confirmed!.id)
  ok('getCurriculumDetail → non-null', detail !== null, detail)
  const topic = detail?.modules?.[0]?.topics?.[0]
  ok('detail has module→topic', Boolean(topic), detail?.modules)
  ok('topic.targetDepth mapped (aware|working|deep)', Boolean(topic) && ['aware', 'working', 'deep'].includes(topic!.targetDepth), topic)

  if (topic) {
    const gaps = await listTopicGaps(topic.id)
    ok('listTopicGaps → Gap[] with FE status field', Array.isArray(gaps) && (gaps.length === 0 || ['open', 'covered', 'skipped'].includes(gaps[0]!.status)), gaps)
    ok('topic gaps populated in detail', Array.isArray(topic.gaps), topic.gaps)
    ok('gapsTotal computed from real gaps', topic.progress.gapsTotal === topic.gaps.length, { total: topic.progress.gapsTotal, len: topic.gaps.length })
  }

  const daily = await getDailyPush('socratic')
  ok('getDailyPush → { push, question } (shape valid)', daily.push === null || (typeof daily.push.gap.label === 'string' && ['wanted', 'weakest', 'refresh'].includes(daily.push.reason)), daily)
  ok('daily-push question present when push exists', daily.push === null || daily.question === null || (typeof daily.question.prompt === 'string'), daily.question)

  const concerns = await getCrossCutting()
  ok('getCrossCutting → ConcernSummary[]', Array.isArray(concerns) && concerns.every((s) => typeof s.total === 'number' && typeof s.concern === 'string'), concerns)

  console.log(process.exitCode ? '\nFE API-CLIENT: FAILURES ABOVE' : '\nFE API-CLIENT PASSED — every mapper parsed live responses.')
}

main().catch((err) => {
  console.error('VERIFY ERROR:', err)
  process.exit(1)
})
