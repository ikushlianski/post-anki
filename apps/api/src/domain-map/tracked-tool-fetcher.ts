import { createHash } from "node:crypto";
import { fetchWithTimeout, truncateText } from "../shared/outbound-fetch.js";
import { loadEnv } from "../shared/env.js";
import type { TrackedTool } from "./tracked-tools.js";

const FETCH_TIMEOUT_MS = 8_000;
// A release/changelog feed is much denser signal per character than
// doc-link-grounding.ts's llms.txt (30,000 chars) — this smaller cap must
// hold across up to 4 tools in one prompt (spec.md's Fetch mechanism
// section).
const MAX_TOOL_CONTENT_CHARS = 4_000;

export interface FetchedTrackedTool {
  content: string;
  hash: string;
}

function hashContent(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

let cachedMockContent: Record<string, string> | undefined;
let cachedMockContentRaw: string | undefined;

// Returns a 3-way result, not just string | undefined: "not mocking at all"
// (the env var is unset — fall through to a real fetch) is a genuinely
// different case from "mocking IS active but this tool_key has no entry"
// (must return null / skip the tool — NEVER fall through to a real
// fetchWithTimeout call, or a mocked e2e run could still reach the real
// internet for any tool_key the test author forgot to include).
function getMockedContent(tool: TrackedTool): { active: boolean; content: string | null } {
  const env = loadEnv();

  if (!env.E2E_MOCK_TRACKED_TOOL_CONTENT) {
    return { active: false, content: null };
  }

  if (cachedMockContentRaw !== env.E2E_MOCK_TRACKED_TOOL_CONTENT) {
    cachedMockContentRaw = env.E2E_MOCK_TRACKED_TOOL_CONTENT;
    cachedMockContent = JSON.parse(env.E2E_MOCK_TRACKED_TOOL_CONTENT) as Record<string, string>;
  }

  return { active: true, content: cachedMockContent?.[tool.toolKey] ?? null };
}

// doc-changelog-scan (issue #49) — SCENARIO 1. Fetch + truncate + hash for a
// single tracked tool. Returns null (never throws) on a fetch failure,
// distinguishable from "fetched, content unchanged" (a real hash). When
// E2E_MOCK_TRACKED_TOOL_CONTENT is set (the e2e-stage-only override —
// spec.md's Fetch mechanism section), fetchWithTimeout is NEVER called for
// ANY tool, regardless of whether this particular tool_key has an entry in
// the mocked map — a tool_key missing from the map returns null (skipped
// this run) rather than silently falling through to a real outbound call.
export async function fetchTrackedTool(tool: TrackedTool): Promise<FetchedTrackedTool | null> {
  const mocked = getMockedContent(tool);

  if (mocked.active) {
    if (mocked.content === null) {
      return null;
    }

    const content = truncateText(mocked.content, MAX_TOOL_CONTENT_CHARS);

    return { content, hash: hashContent(content) };
  }

  const raw = await fetchWithTimeout(tool.sourceUrl, FETCH_TIMEOUT_MS);

  if (raw === null) {
    return null;
  }

  const content = truncateText(raw, MAX_TOOL_CONTENT_CHARS);

  return { content, hash: hashContent(content) };
}
