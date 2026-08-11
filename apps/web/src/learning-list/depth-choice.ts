import type { DepthLevel } from '@post-anki/shared'
import { DEPTH_INTENT } from '@post-anki/shared'

export type DepthChoice = 'basics' | 'advanced'

export const DEPTH_FOR_CHOICE: Record<DepthChoice, DepthLevel> = {
  basics: 'working',
  advanced: 'deep',
}

export const DEPTH_CHOICE_LABEL: Record<DepthChoice, string> = {
  basics: 'Basics',
  advanced: 'Advanced',
}

export function depthForChoice(choice: DepthChoice): DepthLevel {
  return DEPTH_FOR_CHOICE[choice]
}

export function choiceForDepth(depth: DepthLevel): DepthChoice | null {
  if (depth === 'working') {
    return 'basics'
  }

  return depth === 'deep' ? 'advanced' : null
}

export function depthChoiceIntent(choice: DepthChoice): string {
  return DEPTH_INTENT[depthForChoice(choice)]
}

const WEB_DEPTH_TO_LEVEL: Record<string, DepthLevel> = {
  aware: 'awareness',
  awareness: 'awareness',
  working: 'working',
  deep: 'deep',
}

export function normalizeDepthLevel(value: string): DepthLevel {
  return WEB_DEPTH_TO_LEVEL[value] ?? 'working'
}

export function electedDepthForTopic(topic: {
  depthElectedAt: string | null
  depth: string
}): DepthLevel | null {
  return topic.depthElectedAt === null ? null : normalizeDepthLevel(topic.depth)
}

export function nextDepthElectedAt(current: string | null, now: string): string | null {
  return current ?? now
}
