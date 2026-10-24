// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import { KnowledgeBitChatPanel } from './knowledge-bit-chat-panel'
import { useKeyboardOffset } from './use-keyboard-offset'

vi.mock('./knowledge-bit-chat.api', () => ({
  askKnowledgeBitChat: vi.fn(),
  draftKnowledgeBitChat: vi.fn(),
  createKnowledgeItemFromChat: vi.fn(),
}))

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function renderOpenPanel() {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <KnowledgeBitChatPanel knowledgeBitId="bit-1" />
    </QueryClientProvider>,
  )
  fireEvent.click(screen.getByTestId('knowledge-bit-chat-open'))
}

describe('chat bottom sheet', () => {
  it('opens as a bottom sheet dialog with the composer reachable', () => {
    renderOpenPanel()

    const panel = screen.getByTestId('knowledge-bit-chat-panel')

    expect(panel.getAttribute('role')).toBe('dialog')
    expect(panel.className).toContain('fixed inset-x-0')
    expect(panel.className).toContain('dvh')
    expect(screen.getByTestId('knowledge-bit-chat-input').className).toContain('text-base')
    expect(screen.getByTestId('knowledge-bit-chat-send')).toBeTruthy()
  })

  it('closes when the backdrop is tapped', () => {
    renderOpenPanel()
    fireEvent.click(screen.getByTestId('knowledge-bit-chat-backdrop'))

    expect(screen.queryByTestId('knowledge-bit-chat-panel')).toBeNull()
  })

  it('keeps the composer above the keyboard when the visual viewport shrinks', () => {
    const listeners: Record<string, () => void> = {}
    const viewport = {
      height: 844,
      offsetTop: 0,
      addEventListener: vi.fn((type: string, fn: () => void) => {
        listeners[type] = fn
      }),
      removeEventListener: vi.fn(),
    }

    vi.stubGlobal('innerHeight', 844)
    vi.stubGlobal('visualViewport', viewport)

    const { result } = renderHook(() => useKeyboardOffset(true))

    expect(result.current).toBe(0)

    viewport.height = 500
    act(() => listeners.resize?.())

    expect(result.current).toBe(344)
  })

  it('does nothing when visualViewport is unavailable', () => {
    vi.stubGlobal('visualViewport', undefined)

    const { result } = renderHook(() => useKeyboardOffset(true))

    expect(result.current).toBe(0)
  })
})
