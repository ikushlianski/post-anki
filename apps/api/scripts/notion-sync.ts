import process from "node:process";
import { closeDb } from "../src/db/client.js";
import { loadConnectorConfig } from "../src/notion-connector/connector-config.js";
import { runNotionSync } from "../src/notion-connector/notion-sync.orchestrator.js";

const results = await runNotionSync(loadConnectorConfig().connectors);

await closeDb();

for (const result of results) {
  console.log(JSON.stringify(result));
}

process.exit(results.some((result) => result.failed !== 0) ? 1 : 0);
