import { createNotionApiGateway } from "./notion-api.gateway.js";
import type { NotionPageGateway } from "./notion-page.gateway.js";
import { resolveNotionToken } from "./resolve-notion-token.js";

export function defaultNotionGateway(): NotionPageGateway {
  return createNotionApiGateway(async () => (await resolveNotionToken())?.token ?? null);
}
