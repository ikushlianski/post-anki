import { build } from "esbuild";
import { rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const outdir = `${root}dist-lambda`;

await rm(outdir, { recursive: true, force: true });

const result = await build({
  entryPoints: [`${root}src/lambda-handler.ts`],
  outdir,
  outExtension: { ".js": ".mjs" },
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  sourcemap: true,
  minify: false,
  legalComments: "none",
  external: ["@aws-sdk/*", "pg-native", "winston", "winston-transport"],
  banner: {
    js: "import { createRequire as __createRequire } from 'node:module';const require = __createRequire(import.meta.url);",
  },
  metafile: true,
  logLevel: "info",
});

const outputs = Object.keys(result.metafile.outputs);

console.log(`built ${outputs.length} files into ${outdir}`);
