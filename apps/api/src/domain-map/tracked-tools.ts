// doc-changelog-scan (issue #49) — hardcoded starter list of 4 real tools
// (spec.md's Decisions #6), not a user-editable setting in v1. React Router,
// not a standalone Remix repo (Remix's routing merged into React Router v7,
// Nov 2024 — a still-existing but now largely dormant separate Remix repo
// would silently track nothing meaningful going forward). GitHub
// releases.atom feeds are small, structured, and diff cleanly; TC39's
// proposals README has no release feed and is tracked via its single stable
// proposals-list page instead, since a stage change on that page is exactly
// the signal that matters.
export interface TrackedTool {
  toolKey: string;
  label: string;
  sourceUrl: string;
}

export const TRACKED_TOOLS: readonly TrackedTool[] = [
  {
    toolKey: "nextjs",
    label: "Next.js",
    sourceUrl: "https://github.com/vercel/next.js/releases.atom",
  },
  {
    toolKey: "typescript",
    label: "TypeScript",
    sourceUrl: "https://github.com/microsoft/TypeScript/releases.atom",
  },
  {
    toolKey: "react-router",
    label: "React Router",
    sourceUrl: "https://github.com/remix-run/react-router/releases.atom",
  },
  {
    toolKey: "tc39-proposals",
    label: "TC39 Proposals",
    sourceUrl: "https://github.com/tc39/proposals",
  },
] as const;
