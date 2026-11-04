import process from "node:process";
import { closeDb } from "../src/db/client.js";
import { registerEnglishPhrasesSource } from "../src/notion-ingestion/register-english-phrases-source.js";

const args = process.argv.slice(2);
const pageUrl = args.find((arg) => !arg.startsWith("--"));

if (!pageUrl || !args.includes("--english-phrases")) {
  console.error("Usage: npm run notion-sources:register -- <notion page url> --english-phrases");
  process.exit(2);
}

const result = await registerEnglishPhrasesSource(pageUrl);

await closeDb();
console.log(JSON.stringify(result));
process.exit(result.kind === "created" ? 0 : 1);
