// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { DomainNodeTreeItem } from '@post-anki/shared'

import { MergeDomainNodeButton } from './merge-domain-node-button'
import { mergeDomainNodes } from './domain-map.api'

vi.mock('./domain-map.api', () => ({ mergeDomainNodes: vi.fn() }))
vi.mock('@tanstack/react-router', () => ({ useRouter: () => ({ invalidate: vi.fn() }) }))
vi.mock('../ui/searchable-select', () => ({
  SearchableSelect: ({ testId, onChange }: { testId: string; onChange: (v: string) => void }) => (
    <button type="button" data-testid={testId} onClick={() => onChange('n2')} />
  ),
}))

afterEach(cleanup)

const node = (id: string) => ({ id, name: id, children: [] }) as unknown as DomainNodeTreeItem

describe('MergeDomainNodeButton', () => {
  it('should show a failure and keep Confirm usable when the merge fails', async () => {
    vi.mocked(mergeDomainNodes).mockRejectedValue(new Error('boom'))
    render(<MergeDomainNodeButton node={node('n1')} allNodes={[node('n1'), node('n2')]} />)

    fireEvent.click(screen.getByTestId('domain-map-node-merge-button-n1'))
    fireEvent.click(screen.getByTestId('domain-map-node-merge-target-select-n1'))
    fireEvent.click(screen.getByTestId('domain-map-node-merge-confirm-n1'))

    expect(await screen.findByTestId('domain-map-node-merge-failed-n1')).toBeTruthy()
    await waitFor(() =>
      expect((screen.getByTestId('domain-map-node-merge-confirm-n1') as HTMLButtonElement).disabled).toBe(false),
    )
  })
})
