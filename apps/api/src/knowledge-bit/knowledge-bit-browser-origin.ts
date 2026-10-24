import type { KnowledgeBitBrowserOrigin } from "@post-anki/shared";

export interface BrowserOriginInput {
  origin: "extracted" | "manual";
  isAiGenerated: boolean;
  sourceKind: string | null;
  sourceUrl: string | null;
}

export function deriveBrowserOrigin(input: BrowserOriginInput): KnowledgeBitBrowserOrigin {
  if (input.origin === "manual") return "manual";

  if (input.isAiGenerated) return "ai_web";

  if (input.sourceUrl) return "article";

  if (input.sourceKind === "notion") return "notion";

  return "pasted";
}
