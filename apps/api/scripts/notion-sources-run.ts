import process from "node:process";
import { closeDb } from "../src/db/client.js";
import { defaultNotionGateway } from "../src/notion-ingestion/default-notion-gateway.js";
import { runDueNotionSources } from "../src/notion-ingestion/run-due-notion-sources.js";

const reports = await runDueNotionSources(defaultNotionGateway());

await closeDb();

for (const report of reports) {
  console.log(JSON.stringify(report));
}

process.exit(reports.some((report) => report.status === "failed") ? 1 : 0);
