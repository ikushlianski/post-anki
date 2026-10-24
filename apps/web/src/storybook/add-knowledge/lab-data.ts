import {
  KNOWLEDGE_ITEM_MODEL_OPTIONS,
  formatKnowledgeItemModelPrice,
  type KnowledgeItemModelOption,
} from '@post-anki/shared'

export const MODELS: readonly KnowledgeItemModelOption[] = KNOWLEDGE_ITEM_MODEL_OPTIONS

export function shortPrice(option: KnowledgeItemModelOption): string {
  return formatKnowledgeItemModelPrice(option).replace(' in / ', ' / ').replace(' out per 1M', '')
}

const VENDOR_BY_KEY: Record<string, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  google: 'Google',
  mistralai: 'Mistral',
  'meta-llama': 'Meta',
}

export const VENDOR_ORDER = ['OpenAI', 'Anthropic', 'Google', 'Mistral', 'Meta']

export function vendorOf(option: KnowledgeItemModelOption): string {
  const key = option.id.split('/')[1] ?? ''

  return VENDOR_BY_KEY[key] ?? key
}

export function modelsByVendor(): Array<{ vendor: string; options: KnowledgeItemModelOption[] }> {
  return VENDOR_ORDER.map((vendor) => ({
    vendor,
    options: MODELS.filter((option) => vendorOf(option) === vendor),
  })).filter((group) => group.options.length > 0)
}

export interface LabSubject {
  id: string
  name: string
  parentId: string | null
}

export const SUBJECTS: readonly LabSubject[] = [
  { id: 'sub_business', name: 'Business', parentId: null },
  { id: 'sub_hr', name: 'HR', parentId: 'sub_business' },
  { id: 'sub_marketing', name: 'Marketing', parentId: 'sub_business' },
  { id: 'sub_negotiations', name: 'Negotiations', parentId: 'sub_business' },
  { id: 'sub_sales', name: 'Sales', parentId: 'sub_business' },
  { id: 'sub_smm', name: 'SMM', parentId: 'sub_business' },
  { id: 'sub_time', name: 'Time management', parentId: 'sub_business' },
  { id: 'sub_programming', name: 'Programming / Web Development', parentId: null },
  { id: 'sub_ai', name: 'AI', parentId: 'sub_programming' },
  { id: 'sub_architecture', name: 'Architecture', parentId: 'sub_programming' },
  { id: 'sub_cloud', name: 'Cloud Computing', parentId: 'sub_programming' },
  { id: 'sub_databases', name: 'Databases', parentId: 'sub_programming' },
  { id: 'sub_english', name: 'English', parentId: null },
  { id: 'sub_polish', name: 'Polish', parentId: null },
  { id: 'sub_spanish', name: 'Spanish', parentId: null },
  { id: 'sub_swedish', name: 'Swedish', parentId: null },
  { id: 'sub_music', name: 'Music', parentId: null },
  { id: 'sub_investing', name: 'Investing', parentId: null },
]

export function childrenOf(parentId: string): LabSubject[] {
  return SUBJECTS.filter((subject) => subject.parentId === parentId)
}

export function hasChildren(subject: LabSubject): boolean {
  return childrenOf(subject.id).length > 0
}

export function topLevel(): LabSubject[] {
  return SUBJECTS.filter((subject) => subject.parentId === null)
}

export function topLevelLeaves(): LabSubject[] {
  return topLevel().filter((subject) => !hasChildren(subject))
}

export function parents(): LabSubject[] {
  return topLevel().filter(hasChildren)
}

export function breadcrumb(subject: LabSubject): string {
  const parent = SUBJECTS.find((candidate) => candidate.id === subject.parentId)

  return parent ? `${parent.name} › ${subject.name}` : subject.name
}

export function labelOf(id: string): string {
  const subject = SUBJECTS.find((candidate) => candidate.id === id)

  return subject ? breadcrumb(subject) : ''
}

export function modelLabelOf(id: string): string {
  return MODELS.find((option) => option.id === id)?.label ?? ''
}
