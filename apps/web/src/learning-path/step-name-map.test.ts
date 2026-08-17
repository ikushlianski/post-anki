import { describe, expect, it } from 'vitest'

import type { RoleTemplate } from '@post-anki/shared'

import { buildStepNameMap, resolveStepName } from './step-name-map'

function template(overrides: Partial<RoleTemplate>): RoleTemplate {
  return {
    id: 'frontend-engineer',
    name: 'Frontend Engineer',
    targetRoleLabel: 'Frontend Engineer',
    targets: [],
    ...overrides,
  }
}

describe('buildStepNameMap', () => {
  it('should map every target across every template by domain node id', () => {
    const map = buildStepNameMap([
      template({
        targets: [
          { domainNodeId: 'node-1', name: 'Hooks' },
          { domainNodeId: 'node-2', name: 'State Management' },
        ],
      }),
      template({
        id: 'full-stack-engineer',
        targets: [{ domainNodeId: 'node-3', name: 'Routing' }],
      }),
    ])

    expect(map.get('node-1')).toBe('Hooks')
    expect(map.get('node-2')).toBe('State Management')
    expect(map.get('node-3')).toBe('Routing')
  })

  it('should keep the first name seen when two templates share a target', () => {
    const map = buildStepNameMap([
      template({ targets: [{ domainNodeId: 'node-1', name: 'Hooks' }] }),
      template({
        id: 'full-stack-engineer',
        targets: [{ domainNodeId: 'node-1', name: 'Hooks (duplicate)' }],
      }),
    ])

    expect(map.get('node-1')).toBe('Hooks')
  })
})

describe('resolveStepName', () => {
  it('should return the mapped name for a known node', () => {
    const map = new Map([['node-1', 'Hooks']])

    expect(resolveStepName('node-1', map)).toBe('Hooks')
  })

  it('should fall back to a neutral label for an unresolvable node', () => {
    expect(resolveStepName('node-unknown', new Map())).toBe('Untitled step')
  })
})
