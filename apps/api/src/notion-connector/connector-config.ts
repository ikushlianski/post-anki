import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { notionConnectorConfigSchema, type NotionConnectorConfig } from "@post-anki/shared";

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
