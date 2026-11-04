import { APIErrorCode, APIResponseError, Client, isFullBlock } from "@notionhq/client";
import type { BlockObjectResponse } from "@notionhq/client";
import { itemsFromBlocks } from "@post-anki/core";
import { removeNotionItem } from "../notion-connector/notion-sync.orchestrator.js";
import {
  NotionNotConnectedError,
  type NotionCheckResult,
  type NotionPageGateway,
  type NotionPageRead,
  type NotionRemoveResult,
} from "./notion-page.gateway.js";

const BLOCK_PAGE_SIZE = 100;

export type NotionClientFactory = (token: string) => Client;

const defaultClientFactory: NotionClientFactory = (token) => new Client({ auth: token });

async function buildClient(
  resolveToken: () => Promise<string | null>,
  makeClient: NotionClientFactory,
): Promise<Client> {
  const token = await resolveToken();

  if (!token) {
    throw new NotionNotConnectedError();
  }

  return makeClient(token);
}

async function hasChildren(client: Client, blockId: string): Promise<boolean> {
  const block = await client.blocks.retrieve({ block_id: blockId });

  return !isFullBlock(block) || block.has_children;
}

interface BlockRead {
  blocks: BlockObjectResponse[];
  truncated: boolean;
}

function failureReason(err: unknown): NotionCheckResult["reason"] {
  if (err instanceof NotionNotConnectedError) {
    return "not_connected";
  }

  if (
    err instanceof APIResponseError &&
    (err.code === APIErrorCode.Unauthorized || err.code === APIErrorCode.RestrictedResource)
  ) {
    return "invalid_token";
  }

  return "unreachable";
}

async function readBlocks(client: Client, pageId: string, maxBlocks: number): Promise<BlockRead> {
  const blocks: BlockObjectResponse[] = [];
  let cursor: string | undefined;

  do {
    const page = await client.blocks.children.list({
      block_id: pageId,
      page_size: BLOCK_PAGE_SIZE,
      start_cursor: cursor,
    });

    blocks.push(...page.results.filter(isFullBlock));
    cursor = page.has_more ? (page.next_cursor ?? undefined) : undefined;
  } while (cursor && blocks.length < maxBlocks);

  return { blocks: blocks.slice(0, maxBlocks), truncated: blocks.length > maxBlocks || cursor !== undefined };
}

export function createNotionApiGateway(
  resolveToken: () => Promise<string | null>,
  makeClient: NotionClientFactory = defaultClientFactory,
): NotionPageGateway {
  return {
    async readItems(pageId, maxBlocks): Promise<NotionPageRead> {
      const client = await buildClient(resolveToken, makeClient);
      const { blocks, truncated } = await readBlocks(client, pageId, maxBlocks);
      const items = itemsFromBlocks(blocks.filter((block) => !block.has_children)).map((item) => ({
        id: item.id,
        text: item.text,
      }));

      return { items, truncated };
    },

    async removeItems(pageId, itemIds): Promise<NotionRemoveResult> {
      const client = await buildClient(resolveToken, makeClient);
      const result: NotionRemoveResult = { removed: [], failed: [] };

      for (const id of itemIds) {
        try {
          if (await hasChildren(client, id)) {
            result.failed.push(id);
            continue;
          }

          await removeNotionItem({ kind: "page", id: pageId }, id, client);
          result.removed.push(id);
        } catch {
          result.failed.push(id);
        }
      }

      return result;
    },

    async checkConnection() {
      try {
        const client = await buildClient(resolveToken, makeClient);
        const me = await client.users.me({});
        const workspaceName = me.type === "bot" ? (me.bot.workspace_name ?? null) : null;

        return { ok: true, workspaceName, reason: null };
      } catch (err) {
        return { ok: false, workspaceName: null, reason: failureReason(err) };
      }
    },
  };
}
