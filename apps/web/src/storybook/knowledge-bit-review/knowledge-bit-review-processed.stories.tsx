import type { Meta, StoryObj } from '@storybook/react-vite'

import { KnowledgeBitReviewPanel } from '../../knowledge-bit/knowledge-bit-review-panel'
import {
  fullyReviewedSource,
  processedSource,
  threeItemSource,
} from '../../mocks/knowledge-bit-review.mock'

const meta: Meta<typeof KnowledgeBitReviewPanel> = {
  title: 'Knowledge bit review/Processed',
  component: KnowledgeBitReviewPanel,
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'A fully reviewed text stays listed until the reviewer marks it processed. Processed texts sit in a collapsed section with Reopen.',
      },
    },
  },
}

export default meta

type Story = StoryObj<typeof KnowledgeBitReviewPanel>

export const OpenWithPendingCards: Story = {
  args: { initialSources: [threeItemSource] },
}

export const FullyReviewedAwaitingDecision: Story = {
  args: { initialSources: [fullyReviewedSource] },
}

export const ProcessedSectionExpanded: Story = {
  args: { initialSources: [fullyReviewedSource, processedSource] },
  play: ({ canvasElement }) => {
    canvasElement.querySelector('details')?.setAttribute('open', '')
  },
}
