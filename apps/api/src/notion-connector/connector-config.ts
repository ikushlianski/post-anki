import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  isKnowledgeSourceConnector,
  notionConnectorConfigSchema,
  type KnowledgeSourceConnector,
  type NotionConnectorConfig,
} from "@post-anki/shared";
import { z } from "zod";

const PLACEHOLDER = /^REPLACE_WITH_/;

export function defaultConnectorsFile(): string {
  return (
    process.env.NOTION_CONNECTORS_FILE ??
    fileURLToPath(new URL("../../../../notion-connectors.json", import.meta.url))
  );
}

export function parseConnectorConfig(raw: string): NotionConnectorConfig {
  const config = notionConnectorConfigSchema.parse(JSON.parse(raw));

  for (const connector of config.connectors) {
    if (PLACEHOLDER.test(connector.source.id)) {
      throw new Error(
        `Connector "${connector.name}" still has a placeholder source id — set a real Notion ${connector.source.kind} id or URL`,
      );
    }
  }

  return config;
}

export function loadConnectorConfig(file = defaultConnectorsFile()): NotionConnectorConfig {
  return parseConnectorConfig(readFileSync(file, "utf8"));
}

export function parseKnowledgeSourceConnectors(raw: string): KnowledgeSourceConnector[] {
  const { connectors } = z.object({ connectors: z.array(z.unknown()) }).parse(JSON.parse(raw));
  const entries = connectors.filter(
    (entry) => z.object({ destination: z.object({ kind: z.literal("knowledge-source") }) }).safeParse(entry).success,
  );
  const config = notionConnectorConfigSchema.parse({ connectors: entries });
  const result = config.connectors.filter(isKnowledgeSourceConnector);

  for (const connector of result) {
    if (PLACEHOLDER.test(connector.source.id)) {
      throw new Error(`Connector "${connector.name}" still has a placeholder source id`);
    }
  }

  return result;
}

export function loadKnowledgeSourceConnectors(file = defaultConnectorsFile()): KnowledgeSourceConnector[] {
  return parseKnowledgeSourceConnectors(readFileSync(file, "utf8"));
}
