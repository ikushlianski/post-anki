// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

import { TopicDepthGate } from './topic-depth-gate'
import { declineHeadroomOffer, electTopicDepth } from './learning-list.api'

vi.mock('./learning-list.api', () => ({
  electTopicDepth: vi.fn(),
  declineHeadroomOffer: vi.fn(),
}))

const mockedElectTopicDepth = vi.mocked(electTopicDepth)
const mockedDeclineHeadroomOffer = vi.mocked(declineHeadroomOffer)

const NOW = '2026-08-08T10:00:00.000Z'

beforeEach(() => {
  vi.setSystemTime(new Date(NOW))
  mockedElectTopicDepth.mockReset()
  mockedDeclineHeadroomOffer.mockReset()
})

afterEach(() => {
  vi.useRealTimers()
  cleanup()
})

function renderGate(
  overrides: Partial<React.ComponentProps<typeof TopicDepthGate>> = {},
) {
  const onChanged = vi.fn().mockResolvedValue(undefined)

  render(
    <TopicDepthGate
      topicId="topic-1"
      topicTitle="Effects & Synchronization"
      depth="working"
      depthElectedAt={null}
      headroomOfferedAt={null}
      mastered
      onChanged={onChanged}
      {...overrides}
    />,
  )

  return { onChanged }
}

describe('TopicDepthGate — depth election', () => {
  it('should ask for a depth when none has been elected yet', () => {
    renderGate({ depthElectedAt: null })

    expect(screen.getByTestId('depth-prompt')).not.toBeNull()
  })

  it('should not ask again once a depth has been elected', () => {
    renderGate({ depthElectedAt: '2026-08-01T10:00:00.000Z' })

    expect(screen.queryByTestId('depth-prompt')).toBeNull()
  })

  it('should stamp a fresh depthElectedAt on the first election', async () => {
    mockedElectTopicDepth.mockResolvedValue({ ok: true, data: null })
    renderGate({ depthElectedAt: null })

    fireEvent.click(screen.getByTestId('depth-choice-basics'))

    await waitFor(() =>
      expect(mockedElectTopicDepth).toHaveBeenCalledWith({
        data: expect.objectContaining({
          depthElectedAt: expect.any(String) as unknown as string,
        }) as unknown,
      }),
    )
  })

  it('should keep the original depthElectedAt when going deeper later', async () => {
    mockedElectTopicDepth.mockResolvedValue({ ok: true, data: null })
    renderGate({ depthElectedAt: '2026-08-01T10:00:00.000Z' })

    fireEvent.click(screen.getByTestId('headroom-accept'))

    await waitFor(() =>
      expect(mockedElectTopicDepth).toHaveBeenCalledWith({
        data: expect.objectContaining({
          depthElectedAt: '2026-08-01T10:00:00.000Z',
        }) as unknown,
      }),
    )
  })

  it('should show an error and change nothing when saving the election fails', async () => {
    mockedElectTopicDepth.mockResolvedValue({
      ok: false,
      status: 500,
      code: 'request_failed',
      message: null,
    })
    const { onChanged } = renderGate({ depthElectedAt: null })

    fireEvent.click(screen.getByTestId('depth-choice-basics'))

    await screen.findByTestId('depth-election-error')
    expect(onChanged).not.toHaveBeenCalled()
  })
})

describe('TopicDepthGate — headroom offer persistence', () => {
  it('should stay silent when a decline was already persisted before this reload', () => {
    renderGate({
      depthElectedAt: '2026-08-01T10:00:00.000Z',
      headroomOfferedAt: '2026-08-06T10:00:00.000Z',
    })

    expect(screen.queryByTestId('headroom-offer')).toBeNull()
  })

  it('should offer headroom again once the cooling-off period has passed', () => {
    renderGate({
      depthElectedAt: '2026-08-01T10:00:00.000Z',
      headroomOfferedAt: '2026-06-01T10:00:00.000Z',
    })

    expect(screen.getByTestId('headroom-offer')).not.toBeNull()
  })

  it('should persist a decline through the existing PATCH /topics/:id endpoint', async () => {
    mockedDeclineHeadroomOffer.mockResolvedValue({ ok: true, data: null })
    renderGate({ depthElectedAt: '2026-08-01T10:00:00.000Z' })

    fireEvent.click(screen.getByTestId('headroom-decline'))

    await waitFor(() =>
      expect(mockedDeclineHeadroomOffer).toHaveBeenCalledWith({
        data: {
          topicId: 'topic-1',
          headroomOfferedAt: expect.any(String) as unknown as string,
        },
      }),
    )
  })

  it('should show an error when persisting a decline fails', async () => {
    mockedDeclineHeadroomOffer.mockResolvedValue({
      ok: false,
      status: 500,
      code: 'request_failed',
      message: null,
    })
    renderGate({ depthElectedAt: '2026-08-01T10:00:00.000Z' })

    fireEvent.click(screen.getByTestId('headroom-decline'))

    await screen.findByTestId('headroom-decline-error')
  })
})
