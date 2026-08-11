import type { LearningListItemKind } from "@post-anki/shared";
import { guardedFetchText } from "../shared/guarded-fetch.js";

export const MAX_SOURCE_TEXT_CHARS = 20_000;

export type LearningListSourceError =
  | "video_requires_description"
  | "source_blocked"
  | "source_unreachable"
  | "source_empty";

export interface LearningListSourceResolved {
  ok: true;
  text: string;
  finalUrl: string | null;
}

export interface LearningListSourceFailed {
  ok: false;
  error: LearningListSourceError;
  message: string;
}

export type LearningListSourceResult = LearningListSourceResolved | LearningListSourceFailed;

export interface ResolveLearningListSourceParams {
  kind: LearningListItemKind;
  url: string;
  pastedDescription: string | null;
}

export async function resolveLearningListSource(
  params: ResolveLearningListSourceParams,
): Promise<LearningListSourceResult> {
  const description = (params.pastedDescription ?? "").trim();

  if (params.kind === "video") {
    if (description.length === 0) {
      return {
        ok: false,
        error: "video_requires_description" as const,
        message:
          "a video needs its pasted description as the source text — transcripts are never fetched",
      };
    }

    return { ok: true, text: truncate(description), finalUrl: null };
  }

  const fetched = await guardedFetchText(params.url);

  if (!fetched.ok) {
    if (fetched.outcome === "blocked") {
      return { ok: false, error: "source_blocked" as const, message: fetched.message };
    }

    if (fetched.outcome === "http_error") {
      return {
        ok: false,
        error: "source_unreachable" as const,
        message: `the source responded with HTTP ${fetched.status}`,
      };
    }

    return {
      ok: false,
      error: "source_unreachable" as const,
      message: "the source could not be read",
    };
  }

  const text = sanitize(stripHtml(fetched.text));

  if (text.length === 0) {
    return {
      ok: false,
      error: "source_empty" as const,
      message: "the source page carried no readable text",
    };
  }

  return { ok: true, text: truncate(text), finalUrl: fetched.finalUrl };
}

const CONTROL_CHARS_EXCEPT_WHITESPACE = new RegExp(
  "[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F\\u007F]",
  "g",
);

function sanitize(text: string): string {
  return text.replace(CONTROL_CHARS_EXCEPT_WHITESPACE, " ").trim();
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function truncate(text: string): string {
  return text.length > MAX_SOURCE_TEXT_CHARS ? text.slice(0, MAX_SOURCE_TEXT_CHARS) : text;
}
