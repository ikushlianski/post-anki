import { describe, expect, it } from 'vitest'

import type { RoleTemplateTarget } from '@post-anki/shared'

import { formatRoleTemplatePreview } from './role-template-preview'

function targets(names: string[]): RoleTemplateTarget[] {
  return names.map((name, index) => ({ domainNodeId: `node-${index}`, name }))
}

describe('formatRoleTemplatePreview', () => {
  it('should join every target in order when there are few', () => {
    expect(formatRoleTemplatePreview(targets(['Hooks', 'State', 'Routing']))).toBe(
      'Hooks → State → Routing',
    )
  })

  it('should cap the preview and count the rest instead of listing every one', () => {
    expect(
      formatRoleTemplatePreview(
        targets(['A', 'B', 'C', 'D', 'E', 'F', 'G']),
      ),
    ).toBe('A → B → C → D → +3 more')
  })

  it('should say plainly when nothing resolved, never render an empty string', () => {
    expect(formatRoleTemplatePreview([])).toBe('No steps resolve yet')
  })
})
