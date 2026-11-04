import type { NotionConnectionCheckResult } from "@post-anki/shared";

export interface NotionPageItem {
  id: string;
  text: string;
}

export interface NotionPageRead {
  items: NotionPageItem[];
  truncated: boolean;
}

export type NotionCheckResult = Pick<NotionConnectionCheckResult, "ok" | "workspaceName" | "reason">;

export interface NotionRemoveResult {
  removed: string[];
  failed: string[];
}

export interface NotionPageGateway {
  readItems(pageId: string, maxBlocks: number): Promise<NotionPageRead>;
  removeItems(pageId: string, itemIds: string[]): Promise<NotionRemoveResult>;
  checkConnection(): Promise<NotionCheckResult>;
}

export class NotionNotConnectedError extends Error {
  readonly code = "NOTION_NOT_CONNECTED";

  constructor() {
    super("No Notion token is configured");
    this.name = "NotionNotConnectedError";
  }
}
