// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ApiTokenSummary, CreatedApiToken } from '@post-anki/shared'
import { ApiTokensSection } from './api-tokens-section'

afterEach(cleanup)

const summary: ApiTokenSummary = {
  id: 'apitoken_1',
  name: 'claude desktop',
  scopes: ['knowledge:write'],
  createdAt: '2026-11-14T10:00:00.000Z',
  lastUsedAt: null,
  revokedAt: null,
}

function setup() {
  const onList = vi.fn().mockResolvedValue({ tokens: [summary] })
  const onCreate = vi.fn().mockResolvedValue({ ...summary, token: 'pat_secret' } satisfies CreatedApiToken)
  const onRevoke = vi.fn().mockResolvedValue({})

  render(<ApiTokensSection onList={onList} onCreate={onCreate} onRevoke={onRevoke} />)

  return { onList, onCreate, onRevoke }
}

describe('ApiTokensSection', () => {
  it('should list existing keys without showing any key value', async () => {
    setup()

    await screen.findByTestId('api-token-apitoken_1')

    expect(screen.queryByTestId('api-token-value')).toBeNull()
  })

  it('should create a key with the chosen scopes and show the key once until dismissed', async () => {
    const { onCreate } = setup()

    fireEvent.change(screen.getByTestId('api-token-name'), { target: { value: 'laptop' } })
    fireEvent.click(screen.getByTestId('api-token-scope-cards:write'))
    fireEvent.click(screen.getByTestId('api-token-create'))

    await waitFor(() => expect(screen.getByTestId('api-token-value').textContent).toBe('pat_secret'))

    expect(onCreate).toHaveBeenCalledWith({ name: 'laptop', scopes: ['knowledge:write', 'cards:write'] })

    fireEvent.click(screen.getByTestId('api-token-dismiss'))

    expect(screen.queryByTestId('api-token-value')).toBeNull()
  })

  it('should not create a key without a name', async () => {
    const { onCreate } = setup()

    fireEvent.click(screen.getByTestId('api-token-create'))

    expect(await screen.findByTestId('api-tokens-error')).toBeTruthy()
    expect(onCreate).not.toHaveBeenCalled()
  })

  it('should revoke a key and reload the list', async () => {
    const { onRevoke, onList } = setup()

    fireEvent.click(await screen.findByTestId('api-token-revoke-apitoken_1'))

    await waitFor(() => expect(onRevoke).toHaveBeenCalledWith('apitoken_1'))
    await waitFor(() => expect(onList).toHaveBeenCalledTimes(2))
  })
})
