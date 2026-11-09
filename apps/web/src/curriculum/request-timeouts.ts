export const DEFAULT_REQUEST_TIMEOUT_MS = 30_000
export const LLM_REQUEST_TIMEOUT_MS = 120_000

const ID = '[^/]+'

const LLM_BACKED_CALLS: ReadonlyArray<readonly [method: string, path: RegExp]> = [
  ['POST', /^\/knowledge-sources(\/detect-bits|\/subject-checks)?$/],
  ['POST', new RegExp(`^/knowledge-sources/${ID}/regeneration$`)],
  ['POST', new RegExp(`^/knowledge-bits/question-variants/${ID}/answers$`)],
  ['POST', new RegExp(`^/knowledge-bits/${ID}/(chat|chat/draft|chat-messages|example|variants|derived-items)$`)],
  ['POST', /^\/knowledge-bits\/[a-z-]+-scan$/],
  ['POST', /^\/curricula$/],
  ['POST', new RegExp(`^/curricula/${ID}/(sources|reparse|retry-research|retry-structure-draft|approve-sources|structure-turns|resolve-research-candidates|confirm-structure|domain-mappings|stats/recommendations)$`)],
  ['POST', new RegExp(`^/sources/${ID}/refetch$`)],
  ['POST', new RegExp(`^/topics/${ID}/(probe|probe/answer|study-chat|lecture|lecture/sources|cards|study-materials)$`)],
  ['POST', /^\/(probe-sessions|socratic-sessions|qa-chat|global-card-chat|subject-chat\/ask|transcriptions|decide-sessions)$/],
  ['POST', new RegExp(`^/(probe|socratic)-sessions/${ID}/answer$`)],
  ['POST', new RegExp(`^/subjects/${ID}/(doc-scans|domain-priority-reviews|domain-recommendations|phrase-batches|writing-checks|attempts)$`)],
  ['POST', /^\/(doc-scans|subject-duplicate-scans|subject-suggestion-scans|source-duplicate-scans|biz-education-distills|learning-paths|notes|learning-list-items)$/],
  ['POST', new RegExp(`^/learning-list-items/${ID}/classification$`)],
  ['POST', new RegExp(`^/triage-sessions/${ID}/distill$`)],
  ['POST', /^\/admin\/model-comparison\/runs$/],
]

export function requestTimeoutMs(path: string, method = 'GET'): number {
  const pathname = path.split('?')[0] ?? path
  const longRunning = LLM_BACKED_CALLS.some(
    ([callMethod, pattern]) => callMethod === method.toUpperCase() && pattern.test(pathname),
  )

  return longRunning ? LLM_REQUEST_TIMEOUT_MS : DEFAULT_REQUEST_TIMEOUT_MS
}
