#!/usr/bin/env node
// Fitness-function backstop for a real, confirmed gap: dependency-cruiser (.dependency-cruiser.cjs)
// only sees the static import GRAPH. A computed specifier — `import(moduleName)`,
// `require(['p','g'].join(''))` — produces zero graph edges at all, confirmed by direct testing,
// so no dependency-cruiser rule can ever flag it: every rule in .dependency-cruiser.cjs (no
// cross-app internals, no raw SQL outside db/, no packages-depending-on-apps) is fully defeated
// by this one-line change. This script closes that specific gap with an AST-based scan for any
// dynamic import()/require() whose argument is not a plain string literal, anywhere in apps/ or
// packages/ source (test files excluded — the same convention .dependency-cruiser.cjs already
// uses). It does not replace dependency-cruiser; it covers the one thing dependency-cruiser is
// structurally unable to see.

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { extname, join, relative } from 'node:path'
import ts from 'typescript'

const ROOTS = ['apps', 'packages']
const TEST_FILE_PATTERN = /\.(test|spec)\.tsx?$/
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx'])
const SKIP_DIR_NAMES = new Set(['node_modules', 'dist', 'build', '.next', 'coverage'])

function listSourceFiles(dir) {
  const files = []

  for (const entry of readdirSync(dir)) {
    if (SKIP_DIR_NAMES.has(entry)) continue

    const fullPath = join(dir, entry)
    const stats = statSync(fullPath)

    if (stats.isDirectory()) {
      files.push(...listSourceFiles(fullPath))
      continue
    }

    if (SOURCE_EXTENSIONS.has(extname(entry)) && !TEST_FILE_PATTERN.test(entry)) {
      files.push(fullPath)
    }
  }

  return files
}

function isStringLiteralLike(node) {
  return ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)
}

function findViolations(filePath) {
  const source = readFileSync(filePath, 'utf-8')
  const sourceFile = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true)
  const violations = []

  function visit(node) {
    const isDynamicImport = node.kind === ts.SyntaxKind.CallExpression && node.expression.kind === ts.SyntaxKind.ImportKeyword
    const isRequireCall =
      ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'require'

    if ((isDynamicImport || isRequireCall) && ts.isCallExpression(node)) {
      const [firstArg] = node.arguments

      if (firstArg && !isStringLiteralLike(firstArg)) {
        const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile))

        violations.push({
          line: line + 1,
          kind: isDynamicImport ? 'import()' : 'require()',
          text: node.getText(sourceFile),
        })
      }
    }

    ts.forEachChild(node, visit)
  }

  visit(sourceFile)

  return violations
}

function main() {
  const repoRoot = process.cwd()
  let totalViolations = 0

  for (const root of ROOTS) {
    let files = []

    try {
      files = listSourceFiles(join(repoRoot, root))
    } catch {
      continue
    }

    for (const filePath of files) {
      const violations = findViolations(filePath)

      for (const violation of violations) {
        totalViolations += 1
        const relativePath = relative(repoRoot, filePath)
        console.error(
          `${relativePath}:${violation.line}: non-literal ${violation.kind} specifier — ` +
            `"${violation.text}". Dynamic imports must use a literal, statically-analyzable ` +
            `path so dependency-cruiser's fitness functions can actually see the dependency.`,
        )
      }
    }
  }

  if (totalViolations > 0) {
    console.error(`\n${totalViolations} non-literal dynamic import/require specifier(s) found.`)
    process.exit(1)
  }

  console.log('No non-literal dynamic import/require specifiers found.')
}

main()
