#!/usr/bin/env node
// Fails the build when a Node built-in reaches the apps/web BROWSER bundle. packages/core and
// packages/shared are imported by both apps/api (Node) and apps/web (browser), so a Node-only
// import in a shared package that is reachable from packages/core's root barrel silently ends up
// in the browser build — no type error, no build failure, just a runtime crash on every page whose
// component tree touches that barrel. That really shipped (commit 365b058, node:crypto in
// packages/core/src/subject-duplicate/content-hash.ts) and was only found days later by an
// end-to-end sweep.
//
// This script runs the real `vite build` itself rather than inspecting a previous build's output,
// and that is a requirement, not a convenience: reintroducing the original node:crypto import was
// measured to leave NO trace in .output/public/assets — rolldown tree-shakes the offending module
// out of the emitted chunks while the leak is still very much in the graph (dev mode still serves
// the throwing stub, which is how the original bug surfaced). The resolve-time warning is the only
// signal that survives, and it exists only in the build's console output.
//
// Matching on Vite's own warning also means the Node built-in list never has to be maintained
// here: Vite's resolver applies it, and it covers both `node:`-prefixed and bare specifiers
// (verified against `node:crypto` and `crypto`).

import { spawn } from 'node:child_process'
import { isAbsolute, relative } from 'node:path'

const BUILD_COMMAND = 'npm'
const BUILD_ARGS = ['run', 'build', '-w', '@post-anki/web']
const CLIENT_BUILD_MARKER = 'building client environment'
const EXTERNALIZED_PATTERN =
  /Module "([^"]+)" has been externalized for browser compatibility(?:, imported by "([^"]+)")?/g

function runBuild(repoRoot) {
  return new Promise((resolve, reject) => {
    const child = spawn(BUILD_COMMAND, BUILD_ARGS, { cwd: repoRoot, shell: process.platform === 'win32' })
    let output = ''

    child.stdout.on('data', (chunk) => {
      output += chunk
      process.stdout.write(chunk)
    })

    child.stderr.on('data', (chunk) => {
      output += chunk
      process.stderr.write(chunk)
    })

    child.on('error', reject)
    child.on('close', (code) => resolve({ code, output }))
  })
}

function collectLeaks(output, repoRoot) {
  const leaks = new Map()

  for (const match of output.matchAll(EXTERNALIZED_PATTERN)) {
    const [, moduleId, importer] = match
    const importerPath = importer && isAbsolute(importer) ? relative(repoRoot, importer) : importer
    const key = `${moduleId}|${importerPath ?? ''}`

    if (!leaks.has(key)) {
      leaks.set(key, { moduleId, importerPath })
    }
  }

  return [...leaks.values()]
}

function reportLeaks(leaks) {
  console.error('\nNode built-in(s) reached the apps/web browser bundle:\n')

  for (const { moduleId, importerPath } of leaks) {
    console.error(`  "${moduleId}" — imported by ${importerPath ?? 'an unnamed module'}`)
  }

  console.error(
    '\npackages/core and packages/shared are imported by BOTH apps/api (Node) and apps/web\n' +
      '(browser). A Node built-in anywhere reachable from packages/core/src/index.ts (the root\n' +
      'barrel) gets pulled into the browser build, where it throws "Module ... has been\n' +
      'externalized for browser compatibility" at runtime and breaks every page whose component\n' +
      'tree touches that barrel — including pages you never touched. TypeScript will not catch\n' +
      'this: `import { createHash } from "node:crypto"` is valid, correctly-typed code.\n' +
      '\nFix it one of two ways:\n' +
      '  1. Replace the Node API with a dependency-free equivalent that runs in both runtimes.\n' +
      '     packages/core/src/subject-duplicate/content-hash.ts is the worked example — it\n' +
      "     swapped node:crypto's createHash for a pure-JS FNV-1a hash and explains why.\n" +
      '  2. Move the Node-only code into apps/api (Node-only by definition) and keep\n' +
      '     packages/core / packages/shared runtime-neutral.\n' +
      '\nNode-only code in a shared package is fine as long as nothing reachable from the web\n' +
      'entry imports it — but the root barrel re-exports everything, so in practice it is not.',
  )
}

async function main() {
  const repoRoot = process.cwd()
  const { code, output } = await runBuild(repoRoot)

  if (code !== 0) {
    console.error(`\napps/web build failed (exit ${code}) — cannot check for Node built-in leaks.`)
    process.exit(1)
  }

  if (!output.includes(CLIENT_BUILD_MARKER)) {
    console.error(
      `\napps/web build succeeded but never logged "${CLIENT_BUILD_MARKER}", so this guard had\n` +
        'nothing to inspect. Vite changed its output format or the build no longer produces a\n' +
        'browser bundle — update scripts/check-web-node-builtins.mjs before trusting a pass.',
    )
    process.exit(1)
  }

  const leaks = collectLeaks(output, repoRoot)

  if (leaks.length > 0) {
    reportLeaks(leaks)
    process.exit(1)
  }

  console.log('\nNo Node built-ins reached the apps/web browser bundle.')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
