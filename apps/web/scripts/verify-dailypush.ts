// Verifies the answerable daily-push: GET /daily-push?mode= returns a ready
// question, and it can be answered via the probe-answer endpoint.
import { getDailyPush, submitProbe } from '../src/curriculum/api-client'

function ok(label: string, cond: boolean, detail?: unknown) {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}`, cond ? '' : JSON.stringify(detail))
  if (!cond) process.exitCode = 1
}

async function main() {
  const soc = await getDailyPush('socratic')
  ok('daily-push(socratic) → { push, question }', 'push' in soc && 'question' in soc, soc)

  if (!soc.push) {
    console.log('no push available (no confirmed curriculum with open gaps) — skipping answer round-trip')
    return
  }

  ok('socratic question present + prompt', Boolean(soc.question) && typeof soc.question!.prompt === 'string', soc.question)

  const quick = await getDailyPush('quick_test')
  ok('quick_test question has options', Boolean(quick.question) && Array.isArray(quick.question!.options) && quick.question!.options!.length > 0, quick.question)

  const res = await submitProbe({
    topicId: soc.push.topicId,
    gapId: soc.question!.gapId,
    mode: 'socratic',
    answer:
      'Answering the daily push: I reason through the gap directly, covering the core idea and a common pitfall.',
  })
  ok('answering the daily-push question evaluates', Boolean(res) && typeof res!.feedback === 'string', res)

  console.log(process.exitCode ? '\nDAILY-PUSH: FAILURES ABOVE' : '\nDAILY-PUSH PASSED — answerable push (socratic + quick_test) verified live.')
}

main().catch((err) => {
  console.error('VERIFY ERROR:', err)
  process.exit(1)
})
