import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'

import { SuspendedCardsPage } from '../../knowledge-bit/suspended-cards-page'
import { leechCard, suspendedByHandCard, suspendedCards, buriedCard } from '../../mocks/suspended-cards.mock'

const meta: Meta<typeof SuspendedCardsPage> = {
  title: 'Suspended cards/Page',
  component: SuspendedCardsPage,
  tags: ['autodocs'],
  args: {
    cards: suspendedCards,
    rowStates: {},
    hasMore: false,
    loadingMore: false,
    onBringBack: fn(),
    onLoadMore: fn(),
  },
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'The Suspended cards page at /knowledge/suspended. Lists cards set aside by hand, leeches suspended automatically after repeated lapses, and buried cards, each with a button to bring it back into review.',
      },
    },
  },
}

export default meta

type Story = StoryObj<typeof SuspendedCardsPage>

export const MixedReasons: Story = {
  args: { cards: suspendedCards },
  parameters: {
    docs: {
      description: {
        story:
          'A suspended card, a leech with its lapse count, and a card buried until the end of tomorrow.',
      },
    },
  },
}

export const BringingBackAndFailed: Story = {
  args: {
    cards: suspendedCards,
    rowStates: {
      [suspendedByHandCard.knowledgeBitId]: { pending: true, failed: false },
      [leechCard.knowledgeBitId]: { pending: false, failed: true },
    },
  },
  parameters: {
    docs: {
      description: {
        story:
          'One row is saving, so its button reads Working and is disabled. The leech row failed, so it shows an inline error and stays in the list.',
      },
    },
  },
}

export const OnlyBuried: Story = {
  args: { cards: [buriedCard] },
  parameters: {
    docs: {
      description: { story: 'A single buried card, whose button reads Bring back.' },
    },
  },
}

export const MorePagesAvailable: Story = {
  args: { cards: [leechCard, suspendedByHandCard], hasMore: true },
  parameters: {
    docs: {
      description: { story: 'The first page is full, so the Load more button is shown.' },
    },
  },
}

export const Empty: Story = {
  args: { cards: [] },
  parameters: {
    docs: {
      description: { story: 'Nothing is suspended or buried, so the empty state is shown.' },
    },
  },
}
