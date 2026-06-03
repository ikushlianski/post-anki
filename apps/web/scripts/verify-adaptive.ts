// Verifies the adaptive-settings round-trip (speed/hinting/defaultDepth) through
// the real FE api-client. Uses the curricula LIST endpoint (not the detail
// endpoint) so it is unaffected by the BE's pending `fetched_text` migration.
import {
  listCurricula,
  updateCurriculumSettings,
} from '../src/curriculum/api-client'

function ok(label: string, cond: boolean, detail?: unknown) {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}`, cond ? '' : JSON.stringify(detail))
  if (!cond) process.exitCode = 1
}

async function main() {
  const curricula = await listCurricula()
  const c0 = curricula[0]
  ok('have a curriculum', Boolean(c0), curricula)
  if (!c0) return

  ok(
    'curriculum carries adaptive fields (speed/hinting/defaultDepth)',
    ['slow', 'normal', 'fast'].includes(c0.speed) &&
      typeof c0.hinting === 'boolean' &&
      ['aware', 'working', 'deep'].includes(c0.defaultDepth),
    c0,
  )

  const orig = { speed: c0.speed, hinting: c0.hinting, defaultDepth: c0.defaultDepth }

  const updated = await updateCurriculumSettings({
    curriculumId: c0.id,
    speed: 'fast',
    hinting: false,
    defaultDepth: 'deep',
  })
  ok(
    'PATCH returns updated curriculum (fast / hints off / deep)',
    updated.speed === 'fast' && updated.hinting === false && updated.defaultDepth === 'deep',
    updated,
  )

  const relisted = (await listCurricula()).find((c) => c.id === c0.id)!
  ok(
    'settings persist in the list',
    relisted.speed === 'fast' && relisted.hinting === false && relisted.defaultDepth === 'deep',
    relisted,
  )

  const restored = await updateCurriculumSettings({ curriculumId: c0.id, ...orig })
  ok(
    'settings restored to original',
    restored.speed === orig.speed && restored.hinting === orig.hinting && restored.defaultDepth === orig.defaultDepth,
  )

  console.log(process.exitCode ? '\nADAPTIVE: FAILURES ABOVE' : '\nADAPTIVE PASSED — speed/hinting/defaultDepth round-trip via FE verified live.')
}

main().catch((err) => {
  console.error('VERIFY ERROR:', err)
  process.exit(1)
})
