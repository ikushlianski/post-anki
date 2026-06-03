import {
  createCurriculum,
  createModule,
  createSubject,
  createTopic,
  deleteCurriculum,
  deleteModule,
  deleteSubject,
  getCurriculumDetail,
  listCurricula,
  listSubjects,
  listTopicGaps,
  startProbe,
  submitProbe,
} from '../src/curriculum/api-client'

function ok(label: string, cond: boolean, detail?: unknown) {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}`, cond ? '' : JSON.stringify(detail))
  if (!cond) process.exitCode = 1
}

async function detailOf(id: string) {
  const d = await getCurriculumDetail(id)
  if (!d) throw new Error('detail null')
  return d
}

async function main() {
  const created = await createSubject({ name: 'ZZ Delete Me' })
  let subs = await listSubjects()
  ok('createSubject appears', subs.some((s) => s.id === created.id))

  const cur = await createCurriculum({ subjectId: created.id, name: 'ZZ Throwaway', sources: [] })
  let curs = await listCurricula()
  ok('createCurriculum appears', curs.some((c) => c.id === cur.id))
  await deleteCurriculum(cur.id)
  curs = await listCurricula()
  ok('deleteCurriculum removes it', !curs.some((c) => c.id === cur.id))

  await deleteSubject(created.id)
  subs = await listSubjects()
  ok('deleteSubject removes it (+ would cascade curricula)', !subs.some((s) => s.id === created.id))

  const curricula = await listCurricula()
  const confirmed = curricula.find((c) => c.status === 'confirmed')
  if (!confirmed) {
    ok('have a confirmed curriculum for the opener test', false, curricula.map((c) => c.status))
    return
  }

  await createModule(confirmed.id, 'ZZ Opener Mod')
  let d = await detailOf(confirmed.id)
  const mod = d.modules.find((m) => m.title === 'ZZ Opener Mod')!
  await createTopic({ moduleId: mod.id, title: 'ZZ Opener Topic' })
  d = await detailOf(confirmed.id)
  const topic = d.modules.find((m) => m.id === mod.id)!.topics[0]!
  ok('fresh topic has zero gaps', (await listTopicGaps(topic.id)).length === 0)

  const opener = await startProbe(topic.id, 'socratic')
  ok('startProbe → opener with gapId null', Boolean(opener) && opener!.gapId === null, opener)

  const result = await submitProbe({
    topicId: topic.id,
    gapId: null,
    mode: 'socratic',
    answer:
      'A socket is an OS endpoint for bidirectional network communication, identified by an IP and port; a TCP socket provides an ordered, reliable byte stream established via the three-way handshake.',
  })
  ok('submitProbe(opener, gapId:null) evaluates', Boolean(result) && typeof result!.feedback === 'string', result)
  const after = await listTopicGaps(topic.id)
  ok('opener answer discovered gaps or returned a next question', Boolean(result) && (after.length > 0 || result!.nextQuestion !== null), { discovered: after.length, next: result?.nextQuestion })

  await deleteModule(mod.id)
  d = await detailOf(confirmed.id)
  ok('cleanup opener module', !d.modules.some((m) => m.id === mod.id))

  console.log(process.exitCode ? '\nNEW-CONTRACT: FAILURES ABOVE' : '\nNEW-CONTRACT PASSED — deleteSubject + probe cold-start opener verified live.')
}

main().catch((err) => {
  console.error('VERIFY ERROR:', err)
  process.exit(1)
})
