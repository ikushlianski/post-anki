import { tierToModelId } from "../apps/api/src/mastra/model-tier";
import { formatModelTable, parseListOptions, parseModels, selectModels } from "./openrouter-models-core";

const OPENROUTER_MODELS_URL = "https://openrouter.ai/api/v1/models";
const REQUEST_TIMEOUT_MS = 15_000;

async function fetchModelsPayload(): Promise<unknown> {
  const response = await fetch(OPENROUTER_MODELS_URL, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`OpenRouter responded with HTTP ${response.status}`);
  }
  return response.json();
}

async function main(): Promise<void> {
  const options = parseListOptions(process.argv.slice(2));
  const appCheapModelId = tierToModelId("cheap");
  const rows = selectModels(parseModels(await fetchModelsPayload()), options);

  console.log(formatModelTable(rows, appCheapModelId));
  console.log(
    `\n${rows.length} models | structured=${options.structuredOnly} | sort=${options.sort} | ` +
      `search=${options.search ?? "-"} | -> app cheap tier: ${appCheapModelId}`,
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
