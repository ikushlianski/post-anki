import {
  createModule,
  createTopic,
  deleteModule,
  deleteTopic,
  getCurriculumDetail,
  listCurricula,
  reorderModules,
  reorderTopics,
  updateModule,
  updateTopic,
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
  const curricula = await listCurricula()
  const target =
    curricula.find((c) => c.status === 'confirmed' || c.status === 'ready') ?? curricula[0]
  ok('have a target curriculum to shape', Boolean(target), curricula)
  if (!target) return

  const before = await detailOf(target.id)
  const beforeCount = before.modules.length

  await createModule(target.id, 'ZZ Shape Verify')
  let d = await detailOf(target.id)
  const mod = d.modules.find((m) => m.title === 'ZZ Shape Verify')
  ok('createModule → appears', Boolean(mod) && d.modules.length === beforeCount + 1, d.modules.map((m) => m.title))
  if (!mod) return

  await updateModule({ moduleId: mod.id, title: 'ZZ Renamed' })
  d = await detailOf(target.id)
  ok('updateModule rename', d.modules.some((m) => m.id === mod.id && m.title === 'ZZ Renamed'))

  await createTopic({ moduleId: mod.id, title: 'ZZ Topic A', suggestedDepth: 'working' })
  await createTopic({ moduleId: mod.id, title: 'ZZ Topic B' })
  d = await detailOf(target.id)
  let m2 = d.modules.find((m) => m.id === mod.id)!
  ok('createTopic ×2', m2.topics.length === 2, m2.topics.map((t) => t.title))
  const tA = m2.topics.find((t) => t.title === 'ZZ Topic A')!
  const tB = m2.topics.find((t) => t.title === 'ZZ Topic B')!

  await reorderTopics(mod.id, [tB.id, tA.id])
  d = await detailOf(target.id)
  m2 = d.modules.find((m) => m.id === mod.id)!
  ok('reorderTopics (B before A)', m2.topics[0]?.id === tB.id, m2.topics.map((t) => t.title))

  await updateTopic({ topicId: tA.id, targetDepth: 'deep' })
  d = await detailOf(target.id)
  m2 = d.modules.find((m) => m.id === mod.id)!
  ok('updateTopic re-depth → deep', m2.topics.find((t) => t.id === tA.id)?.targetDepth === 'deep')

  const ids = d.modules.map((m) => m.id)
  if (ids.length >= 2 && ids[0] !== mod.id) {
    await reorderModules(target.id, [mod.id, ...ids.filter((i) => i !== mod.id)])
    d = await detailOf(target.id)
    ok('reorderModules (test module to front)', d.modules[0]?.id === mod.id, d.modules.map((m) => m.title))
  }

  const otherMod = d.modules.find((m) => m.id !== mod.id)
  if (otherMod) {
    await updateTopic({ topicId: tA.id, moduleId: otherMod.id })
    d = await detailOf(target.id)
    const movedInto = d.modules.find((m) => m.id === otherMod.id)!
    ok('move topic between modules', movedInto.topics.some((t) => t.id === tA.id), movedInto.topics.map((t) => t.title))
    await deleteTopic(tA.id)
  }

  await deleteModule(mod.id)
  d = await detailOf(target.id)
  ok('deleteModule cleanup → back to start', !d.modules.some((m) => m.id === mod.id) && d.modules.length === beforeCount, d.modules.map((m) => m.title))

  console.log(process.exitCode ? '\nSHAPE: FAILURES ABOVE' : '\nSHAPE ENDPOINTS PASSED — create/rename/reorder/move/delete verified live + self-cleaned.')
}

main().catch((err) => {
  console.error('SHAPE VERIFY ERROR:', err)
  process.exit(1)
})
