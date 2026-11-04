import {
  NotionNotConnectedError,
  type NotionCheckResult,
  type NotionPageGateway,
  type NotionPageItem,
  type NotionPageRead,
  type NotionRemoveResult,
} from "./notion-page.gateway.js";

export class FakeNotionPageGateway implements NotionPageGateway {
  readonly removedIds: string[] = [];
  readCalls = 0;
  removeCalls = 0;
  connected = true;
  readError: Error | null = null;
  failRemovalFor = new Set<string>();
  blocksWithChildren = new Set<string>();

  constructor(private readonly pages: Map<string, NotionPageItem[]> = new Map()) {}

  setPage(pageId: string, items: NotionPageItem[]): void {
    this.pages.set(pageId, items);
  }

  async readItems(pageId: string, maxBlocks: number): Promise<NotionPageRead> {
    this.readCalls += 1;

    if (!this.connected) {
      throw new NotionNotConnectedError();
    }

    if (this.readError) {
      throw this.readError;
    }

    const all = this.pages.get(pageId) ?? [];

    return { items: all.slice(0, maxBlocks), truncated: all.length > maxBlocks };
  }

  async removeItems(pageId: string, itemIds: string[]): Promise<NotionRemoveResult> {
    this.removeCalls += 1;

    const result: NotionRemoveResult = { removed: [], failed: [] };
    const remaining = this.pages.get(pageId) ?? [];

    for (const id of itemIds) {
      if (this.failRemovalFor.has(id) || this.blocksWithChildren.has(id)) {
        result.failed.push(id);
        continue;
      }

      this.removedIds.push(id);
      result.removed.push(id);
      this.pages.set(
        pageId,
        remaining.filter((item) => !this.removedIds.includes(item.id)),
      );
    }

    return result;
  }

  async checkConnection(): Promise<NotionCheckResult> {
    return this.connected
      ? { ok: true, workspaceName: "Fake workspace", reason: null }
      : { ok: false, workspaceName: null, reason: "not_connected" };
  }
}
