import { parseDurableFlag } from "./durable-extraction.config.js";

export function isDurableExtractionEnabled(
  raw: string | undefined = process.env.DURABLE_EXTRACTION,
  nodeEnv: string | undefined = process.env.NODE_ENV,
): boolean {
  return nodeEnv === "production" || parseDurableFlag(raw);
}
