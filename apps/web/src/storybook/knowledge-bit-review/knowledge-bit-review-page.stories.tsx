import type { Meta, StoryObj } from '@storybook/react-vite'

import { KnowledgeBitReviewPage } from '../../knowledge-bit/knowledge-bit-review-page'
import { realisticSources } from '../../mocks/knowledge-bit-review.mock'

const meta: Meta<typeof KnowledgeBitReviewPage> = {
  title: 'Knowledge bit review/Approve page',
  component: KnowledgeBitReviewPage,
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'The Knowledge triage page at /knowledge-bit-review. Shows how many suggestions are waiting and a Start triage button; the cards are then reviewed one at a time in full-screen focus mode.',
      },
    },
  },
}

export default meta

type Story = StoryObj<typeof KnowledgeBitReviewPage>

export const ReadyToApprove: Story = {
  args: { sources: realisticSources() },
  parameters: {
    docs: {
      description: {
        story:
          'Two sources with ready cards: the count, Start triage, the bulk bar and the per-source rows are visible.',
      },
    },
  },
}

export const NoPendingSuggestions: Story = {
  args: { sources: [] },
  parameters: {
    docs: {
      description: { story: 'Nothing is waiting for review, so the empty state is shown.' },
    },
  },
}

export const PhoneWidth: Story = {
  args: { sources: realisticSources() },
  parameters: {
    viewport: { defaultViewport: 'mobile1' },
    docs: {
      description: {
        story:
          'The same page at phone width. The Start triage button spans the full width.',
      },
    },
  },
}
