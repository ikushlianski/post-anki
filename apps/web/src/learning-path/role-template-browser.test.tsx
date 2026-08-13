// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

import type { RoleTemplate } from '@post-anki/shared'

import { RoleTemplateBrowser } from './role-template-browser'

afterEach(cleanup)

function template(overrides: Partial<RoleTemplate>): RoleTemplate {
  return {
    id: 'frontend-engineer',
    name: 'Frontend Engineer',
    targetRoleLabel: 'Frontend Engineer',
    targets: [{ domainNodeId: 'node-1', name: 'React Hooks' }],
    ...overrides,
  }
}

describe('RoleTemplateBrowser', () => {
  it('should invite starting a path when none are available yet', () => {
    render(
      <RoleTemplateBrowser templates={[]} onStart={vi.fn()} onStarted={vi.fn()} />,
    )

    expect(screen.getByTestId('role-template-empty')).toBeTruthy()
  })

  it('should preview every template resolved live, without creating anything', () => {
    render(
      <RoleTemplateBrowser
        templates={[template({})]}
        onStart={vi.fn()}
        onStarted={vi.fn()}
      />,
    )

    expect(screen.getAllByTestId('role-template-card')).toHaveLength(1)
    expect(screen.getByText('React Hooks')).toBeTruthy()
  })

  it('should start a path and hand the new path id to the caller', async () => {
    const onStart = vi.fn().mockResolvedValue({
      ok: true,
      data: { path: { id: 'path-1' }, steps: [] },
    })
    const onStarted = vi.fn()

    render(
      <RoleTemplateBrowser
        templates={[template({})]}
        onStart={onStart}
        onStarted={onStarted}
      />,
    )

    fireEvent.click(screen.getByTestId('role-template-start'))

    await waitFor(() => expect(onStarted).toHaveBeenCalledWith('path-1'))
    expect(onStart).toHaveBeenCalledWith('frontend-engineer')
  })

  it('should surface a failed start without pretending it succeeded', async () => {
    const onStart = vi.fn().mockResolvedValue({
      ok: false,
      status: 422,
      code: 'unresolved_target',
      message: 'Frontend Engineer → node not found',
    })

    render(
      <RoleTemplateBrowser
        templates={[template({})]}
        onStart={onStart}
        onStarted={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByTestId('role-template-start'))

    await waitFor(() =>
      expect(screen.getByTestId('role-template-start-error').textContent).toContain(
        'node not found',
      ),
    )
  })
})
