import type { MilestoneEntityType } from '@post-anki/shared'

const KNOWN_CRITERIA_LABEL: Record<string, string> = {
  full_mastery: 'Fully mastered',
}

export function criteriaLabel(criteriaKey: string): string {
  return KNOWN_CRITERIA_LABEL[criteriaKey] ?? criteriaKey
}

const ENTITY_TYPE_LABEL: Record<MilestoneEntityType, string> = {
  curriculum: 'Curriculum',
  domain_node: 'Area',
}

export function entityTypeLabel(entityType: MilestoneEntityType): string {
  return ENTITY_TYPE_LABEL[entityType]
}
