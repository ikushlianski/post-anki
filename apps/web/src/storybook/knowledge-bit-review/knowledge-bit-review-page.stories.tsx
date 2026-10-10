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
          'The Approve suggestions page at /knowledge-bit-review. Lists suggested knowledge items grouped by their source, each with generated question cards that the reviewer approves, edits or rejects.',
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
          'Two sources, one with three items that each carry question cards, so the per-source approve-all button and the bulk bar are both visible.',
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
          'The same page at phone width. Cards stack, and the approve and reject buttons span the full card width.',
      },
    },
  },
}
