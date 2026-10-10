import type { KnowledgeBitQuestionVariantKind } from '@post-anki/shared'

export function variantKindLabel(kind: KnowledgeBitQuestionVariantKind): string {
  switch (kind) {
    case 'basic':
      return 'Front / back'
    case 'fill_in_the_blank':
      return 'Fill in the blank'
    case 'wh_question':
      return 'Why question'
  }
}
