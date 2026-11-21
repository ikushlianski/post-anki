export const NOTION_ACCESS_HELP =
  "Notion denied access. The Notion integration behind NOTION_TOKEN needs the Read content and Update content capabilities, and every English phrases page must be shared with it with edit access.";

export class NotionAccessError extends Error {
  constructor(cause: unknown) {
    super(NOTION_ACCESS_HELP, { cause });
    this.name = "NotionAccessError";
  }
}

const ACCESS_CODES = new Set(["unauthorized", "restricted_resource"]);

export function isNotionAccessError(err: unknown): boolean {
  if (!err || typeof err !== "object") {
    return false;
  }

  const { code, status } = err as { code?: unknown; status?: unknown };

  return (typeof code === "string" && ACCESS_CODES.has(code)) || status === 401 || status === 403;
}
