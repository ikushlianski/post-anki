import type { Meta, StoryObj } from '@storybook/react-vite'

import { KnowledgeBitReviewPanel } from '../../knowledge-bit/knowledge-bit-review-panel'
import { threeItemSource } from '../../mocks/knowledge-bit-review.mock'

const meta: Meta<typeof KnowledgeBitReviewPanel> = {
  title: 'Knowledge bit review/Source group',
  component: KnowledgeBitReviewPanel,
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'The panel that owns review state. It renders the bulk bar and one source group per source.',
      },
    },
  },
}

export default meta

type Story = StoryObj<typeof KnowledgeBitReviewPanel>

export const SourceWithThreeItemsAndBulkBar: Story = {
  args: { initialSources: [threeItemSource] },
  parameters: {
    docs: {
      description: {
        story:
          'One source with three items: the first is focused, the bulk bar offers approve-all for the ready items, and the source offers approve-all from this source.',
      },
    },
  },
}
