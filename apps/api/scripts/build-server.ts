import { build } from "esbuild";
import { readFile, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const outdir = `${root}dist/server`;

const pkg = JSON.parse(await readFile(`${root}package.json`, "utf8")) as {
  dependencies: Record<string, string>;
};
const thirdParty = Object.keys(pkg.dependencies).filter((name) => !name.startsWith("@post-anki/"));

await rm(`${root}dist`, { recursive: true, force: true });

await build({
  entryPoints: [`${root}src/server.ts`],
  outdir,
  outExtension: { ".js": ".mjs" },
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  sourcemap: true,
  legalComments: "none",
  external: [...thirdParty, ...thirdParty.map((name) => `${name}/*`), "pg-native"],
  banner: {
    js: "import { createRequire as __createRequire } from 'node:module';const require = __createRequire(import.meta.url);",
  },
  logLevel: "info",
});

console.log(`built server bundle into ${outdir}`);
