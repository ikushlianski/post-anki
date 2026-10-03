import type { ProbeScope } from '@post-anki/shared'
import type { CurriculumDetail } from '../curriculum/model'

export interface ExamScopeOption {
  scope: ProbeScope
  scopeId: string
  label: string
}

// Curriculum first (always present, S6), then modules, then tags deduped
// by tag id across every module/topic — a tag can appear on several.
export function buildExamScopeOptions(
  curriculumId: string,
  modules: CurriculumDetail['modules'],
): ExamScopeOption[] {
  const options: ExamScopeOption[] = [
    { scope: 'curriculum', scopeId: curriculumId, label: 'This whole curriculum' },
  ]

  for (const module of modules) {
    options.push({ scope: 'module', scopeId: module.id, label: module.title })
  }

  const seenTagIds = new Set<string>()

  for (const module of modules) {
    for (const tag of module.tags ?? []) {
      if (!seenTagIds.has(tag.id)) {
        seenTagIds.add(tag.id)
        options.push({ scope: 'tag', scopeId: tag.id, label: `#${tag.name}` })
      }
    }

    for (const topic of module.topics) {
      for (const tag of topic.tags ?? []) {
        if (!seenTagIds.has(tag.id)) {
          seenTagIds.add(tag.id)
          options.push({ scope: 'tag', scopeId: tag.id, label: `#${tag.name}` })
        }
      }
    }
  }

  return options
}
