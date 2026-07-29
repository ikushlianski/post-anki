/**
 * Fitness-function rules for the post-anki monorepo.
 *
 * Monorepo layout this config assumes (verified against the actual tree before writing
 * these rules, not guessed):
 *   apps/api     — @post-anki/api  (backend, owns apps/api/src/db/ as its DB access layer)
 *   apps/bot     — @post-anki/bot  (Telegram bot, owns apps/bot/src/db/ as its DB access layer)
 *   apps/web     — @post-anki/web  (frontend, no DB access layer of its own)
 *   apps/mobile  — @post-anki/mobile (frontend, no DB access layer of its own)
 *   packages/core   — @post-anki/core   (shared domain logic)
 *   packages/shared — @post-anki/shared (shared types/utilities)
 *
 * Run: npx depcruise --config .dependency-cruiser.cjs --include-only "^(apps|packages)" apps packages
 */

const APPS = ["api", "bot", "web", "mobile"];

// dependency-cruiser rules can't back-reference a capture group from `from` inside `to`,
// so "app X may not import app Y's internals" is expressed as one rule per app, each
// pointing `to` at the *other* three apps' src/ trees.
const noCrossAppInternalsRules = APPS.map((app) => ({
  name: `no-cross-app-internals-${app}`,
  severity: "error",
  comment:
    "Apps may not reach into another app's internals directly. Code that needs to be " +
    "shared across apps belongs in packages/shared or packages/core — importing " +
    "another app's src/ files couples deployables that should be independently " +
    "deployable and turns one app's refactor into a cross-app break.",
  from: {
    path: `^apps/${app}/src`,
  },
  to: {
    path: `^apps/(${APPS.filter((other) => other !== app).join("|")})/src`,
  },
}));

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    ...noCrossAppInternalsRules,
    {
      name: "no-raw-sql-outside-db-layer",
      severity: "error",
      comment:
        "Only apps/*/src/db/ may open a raw Postgres connection (the 'pg' driver). Every " +
        "other module must go through that app's db layer (getDb()/schema exports) instead " +
        "of issuing raw SQL directly, so there is exactly one place per app where the raw " +
        "connection is created and pooled. Test files are excluded — integration tests " +
        "legitimately connect directly to set up/tear down fixture data, which is an " +
        "accepted, separate testing convention, not application runtime code.",
      from: {
        path: "^apps/(api|bot)/src/(?!db/)",
        pathNot: "\\.(test|spec|integration\\.test)\\.tsx?$",
      },
      to: {
        path: "^(node_modules/)?pg(/|$)",
      },
    },
    {
      name: "no-packages-depending-on-apps",
      severity: "error",
      comment:
        "packages/core and packages/shared are the shared foundation apps build on — the " +
        "dependency direction must stay one-way. A package importing from apps/ would " +
        "invert that and make the shared layer depend on the very deployables it's meant " +
        "to be reused by.",
      from: {
        path: "^packages/(core|shared)/src",
      },
      to: {
        path: "^apps/",
      },
    },
    {
      name: "no-unresolvable-static-imports",
      severity: "error",
      comment:
        "Catches a static import/require whose specifier dependency-cruiser recognizes but " +
        "can't resolve to an actual file (a typo'd package name, a broken path after a rename). " +
        "NOTE: this does NOT catch a computed/dynamic specifier like `import(moduleName)` or " +
        "`require(['p','g'].join(''))` — confirmed by direct testing that dependency-cruiser's " +
        "static parser records zero dependency edges at all for a non-literal specifier, so " +
        "there is nothing here for `couldNotResolve` to match against. That evasion class (every " +
        "rule above defeated by a computed import path) is closed separately by " +
        "scripts/check-no-dynamic-imports.mjs, an AST-based scanner run in the same CI job — " +
        "dependency-cruiser is a dependency-GRAPH tool and is structurally unable to see an edge " +
        "that was never recorded, no rule shape here can fix that.",
      from: {
        path: "^(apps|packages)/",
      },
      to: {
        couldNotResolve: true,
      },
    },
  ],
  options: {
    doNotFollow: {
      path: "node_modules",
    },
    exclude: {
      path: "\\.(test|spec)\\.tsx?$|/node_modules/",
    },
    tsPreCompilationDeps: true,
    combinedDependencies: true,
    enhancedResolveOptions: {
      exportsFields: ["exports"],
      conditionNames: ["import", "require", "node", "default"],
      mainFields: ["module", "main", "types", "typings"],
    },
    reporterOptions: {
      dot: {
        collapsePattern: "node_modules/[^/]+",
      },
    },
  },
};
