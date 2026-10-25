import { z } from "zod";
import { knowledgeBitOverviewStateSchema, type KnowledgeBitOverviewState } from "./knowledge-bit-overview";

export const KNOWLEDGE_BIT_BROWSER_TEXT_MAX = 200;

export const knowledgeBitBrowserOriginValues = ["manual", "ai_web", "pasted", "notion", "article"] as const;
export const knowledgeBitBrowserAddedByValues = ["you", "ai"] as const;
export const knowledgeBitBrowserLinkValues = ["has", "none"] as const;

export type KnowledgeBitBrowserOriginValue = (typeof knowledgeBitBrowserOriginValues)[number];
export type KnowledgeBitBrowserAddedBy = (typeof knowledgeBitBrowserAddedByValues)[number];
export type KnowledgeBitBrowserLink = (typeof knowledgeBitBrowserLinkValues)[number];

export interface KnowledgeBitBrowserFilters {
  question?: string;
  answer?: string;
  origins?: KnowledgeBitBrowserOriginValue[];
  addedBy?: KnowledgeBitBrowserAddedBy[];
  link?: KnowledgeBitBrowserLink;
  site?: string;
  from?: string;
  to?: string;
  states?: KnowledgeBitOverviewState[];
}

const SITE_PATTERN = /^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/;
const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function normalizeBrowserSite(input: string): string | null {
  const host = input
    .trim()
    .toLowerCase()
    .replace(/^[a-z][a-z0-9+.-]*:\/\//, "")
    .replace(/^[^/?#@]*@/, "")
    .split(/[/?#]/)[0]
    ?.replace(/:\d*$/, "")
    .replace(/^www\./, "")
    .replace(/\.+$/, "");

  return host && SITE_PATTERN.test(host) && !host.includes("..") ? host : null;
}

export function parseBrowserDateBound(input: string): string | null {
  const value = input.trim();

  if (DAY_PATTERN.test(value)) {
    return Number.isNaN(Date.parse(`${value}T00:00:00Z`)) ? null : value;
  }

  const parsed = z.string().datetime({ offset: true }).safeParse(value);

  return parsed.success ? value : null;
}

export function browserDateBoundInstant(bound: string, edge: "start" | "end"): Date {
  if (!DAY_PATTERN.test(bound)) {
    return new Date(bound);
  }

  return new Date(`${bound}T${edge === "start" ? "00:00:00.000" : "23:59:59.999"}Z`);
}

export function isBrowserDateRangeReversed(filters: Pick<KnowledgeBitBrowserFilters, "from" | "to">): boolean {
  if (!filters.from || !filters.to) {
    return false;
  }

  return (
    browserDateBoundInstant(filters.from, "start").getTime() >
    browserDateBoundInstant(filters.to, "end").getTime()
  );
}

function listOf(raw: unknown): string[] {
  const parts = Array.isArray(raw) ? raw : typeof raw === "string" ? raw.split(",") : [];

  return parts.filter((part): part is string => typeof part === "string").map((part) => part.trim());
}

function pickFromAllowed<T extends string>(raw: unknown, allowed: readonly T[]): T[] | undefined {
  const picked = allowed.filter((value) => listOf(raw).includes(value));

  return picked.length > 0 ? picked : undefined;
}

function text(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;

  const value = raw.trim().slice(0, KNOWLEDGE_BIT_BROWSER_TEXT_MAX).trim();

  return value === "" ? undefined : value;
}

export function parseKnowledgeBitBrowserFilters(raw: Record<string, unknown>): KnowledgeBitBrowserFilters {
  const site = typeof raw.site === "string" ? normalizeBrowserSite(raw.site) : null;
  const from = typeof raw.from === "string" ? parseBrowserDateBound(raw.from) : null;
  const to = typeof raw.to === "string" ? parseBrowserDateBound(raw.to) : null;
  const link = knowledgeBitBrowserLinkValues.find((value) => value === raw.link);
  const candidates: KnowledgeBitBrowserFilters = {
    question: text(raw.question),
    answer: text(raw.answer),
    origins: pickFromAllowed(raw.origins, knowledgeBitBrowserOriginValues),
    addedBy: pickFromAllowed(raw.addedBy, knowledgeBitBrowserAddedByValues),
    link: site ? "has" : link,
    site: site ?? undefined,
    from: from ?? undefined,
    to: to ?? undefined,
    states: pickFromAllowed(raw.states, knowledgeBitOverviewStateSchema.options),
  };

  return Object.fromEntries(
    Object.entries(candidates).filter(([, value]) => value !== undefined),
  ) as KnowledgeBitBrowserFilters;
}
