import { parseDurableFlag } from "./durable-extraction.config.js";

export function isDurableExtractionEnabled(raw: string | undefined = process.env.DURABLE_EXTRACTION): boolean {
  return parseDurableFlag(raw);
}
