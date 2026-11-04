import { z } from "zod";

export const NOTION_SOURCE_FREQUENCIES = ["manual", "daily", "nightly"] as const;
export const notionSourceFrequency = z.enum(NOTION_SOURCE_FREQUENCIES);
export type NotionSourceFrequency = z.infer<typeof notionSourceFrequency>;

export const MAX_NOTION_ITEMS_PER_RUN = 100;
export const DEFAULT_NOTION_ITEMS_PER_RUN = 10;

const PAGE_ID_AT_END = /([0-9a-f]{32})$/i;

export function extractNotionPageId(rawUrl: string): string | null {
  let url: URL;

  try {
    url = new URL(rawUrl.trim());
  } catch {
    return null;
  }

  const lastSegment = url.pathname.split("/").filter(Boolean).pop() ?? "";
  const match = PAGE_ID_AT_END.exec(lastSegment.replace(/-/g, ""));

  return match?.[1] ? match[1].toLowerCase() : null;
}

export function isNotionPageUrl(rawUrl: string): boolean {
  let url: URL;

  try {
    url = new URL(rawUrl.trim());
  } catch {
    return false;
  }

  const host = url.hostname.toLowerCase();
  const hostAllowed =
    host === "notion.so" ||
    host === "www.notion.so" ||
    host === "notion.com" ||
    host === "www.notion.com" ||
    host === "app.notion.com" ||
    host.endsWith(".notion.site");

  return url.protocol === "https:" && hostAllowed && extractNotionPageId(rawUrl) !== null;
}

const pageUrl = z
  .string()
  .trim()
  .max(2000)
  .refine(isNotionPageUrl, "must be an https Notion page link (notion.so, notion.com or notion.site)");

export const notionIngestionRunStatus = z.enum([
  "running",
  "ok",
  "partial",
  "failed",
  "skipped_budget",
  "skipped_no_connection",
]);

export type NotionIngestionRunStatus = z.infer<typeof notionIngestionRunStatus>;

export const notionIngestionSource = z.object({
  id: z.string(),
  name: z.string(),
  pageUrl: z.string(),
  subjectId: z.string(),
  subjectPath: z.array(z.string()),
  itemsPerRun: z.number().int().min(1).max(MAX_NOTION_ITEMS_PER_RUN),
  frequency: notionSourceFrequency,
  removeAfterImport: z.boolean(),
  paused: z.boolean(),
  nextRunAt: z.string().nullable(),
  lastRun: z
    .object({
      status: notionIngestionRunStatus,
      finishedAt: z.string().nullable(),
      imported: z.number().int().min(0),
      removed: z.number().int().min(0),
      errorCode: z.string().nullable(),
    })
    .nullable(),
});

export type NotionIngestionSource = z.infer<typeof notionIngestionSource>;

export const createNotionIngestionSourceInput = z.object({
  name: z.string().trim().min(1).max(120),
  pageUrl,
  subjectId: z.string().min(1),
  itemsPerRun: z.number().int().min(1).max(MAX_NOTION_ITEMS_PER_RUN).default(DEFAULT_NOTION_ITEMS_PER_RUN),
  frequency: notionSourceFrequency.default("manual"),
  removeAfterImport: z.boolean().default(false),
});

export type CreateNotionIngestionSourceInput = z.input<typeof createNotionIngestionSourceInput>;

export const updateNotionIngestionSourceInput = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  pageUrl: pageUrl.optional(),
  subjectId: z.string().min(1).optional(),
  itemsPerRun: z.number().int().min(1).max(MAX_NOTION_ITEMS_PER_RUN).optional(),
  frequency: notionSourceFrequency.optional(),
  removeAfterImport: z.boolean().optional(),
  paused: z.boolean().optional(),
});

export type UpdateNotionIngestionSourceInput = z.infer<typeof updateNotionIngestionSourceInput>;

export const notionRunResult = z.object({
  status: notionIngestionRunStatus.exclude(["running"]),
  read: z.number().int().min(0),
  imported: z.number().int().min(0),
  skippedExisting: z.number().int().min(0),
  ignored: z.number().int().min(0),
  removed: z.number().int().min(0),
  removeFailed: z.number().int().min(0),
  truncated: z.boolean(),
  pendingAfterLimit: z.number().int().min(0),
});

export type NotionRunResult = z.infer<typeof notionRunResult>;

export const notionConnectionStatus = z
  .object({
    configured: z.boolean(),
    origin: z.enum(["settings", "env", "none"]),
    canStoreToken: z.boolean(),
  })
  .strict();

export type NotionConnectionStatus = z.infer<typeof notionConnectionStatus>;

export const saveNotionConnectionInput = z.object({
  token: z.string().trim().min(1).max(500),
});

export type SaveNotionConnectionInput = z.infer<typeof saveNotionConnectionInput>;

export const NOTION_CONNECTION_FAILURE_REASONS = ["not_connected", "invalid_token", "unreachable"] as const;
export const notionConnectionFailureReason = z.enum(NOTION_CONNECTION_FAILURE_REASONS);
export type NotionConnectionFailureReason = z.infer<typeof notionConnectionFailureReason>;

export const notionConnectionCheckResult = z
  .object({
    ok: z.boolean(),
    workspaceName: z.string().nullable(),
    reason: notionConnectionFailureReason.nullable(),
  })
  .strict();

export type NotionConnectionCheckResult = z.infer<typeof notionConnectionCheckResult>;
