import type { Meta, StoryObj } from '@storybook/react-vite'

import { KnowledgeBitReviewPanel } from '../../knowledge-bit/knowledge-bit-review-panel'
import { threeItemSource } from '../../mocks/knowledge-bit-review.mock'

const meta: Meta<typeof KnowledgeBitReviewPanel> = {
  title: 'Knowledge bit review/Landing',
  component: KnowledgeBitReviewPanel,
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'The panel before triage starts: card count, a large Start triage button, Approve all ready and one row per source. No card text is shown.',
      },
    },
  },
}

export default meta

type Story = StoryObj<typeof KnowledgeBitReviewPanel>

export const LandingWithThreeCards: Story = {
  args: { initialSources: [threeItemSource] },
  parameters: {
    docs: {
      description: {
        story:
          'One source with three cards: the count, the Start triage button and the bulk approve bar are visible; the card text stays hidden until triage starts.',
      },
    },
  },
}
