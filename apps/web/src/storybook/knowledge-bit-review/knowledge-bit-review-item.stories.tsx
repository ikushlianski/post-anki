import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn, userEvent, within } from 'storybook/test'

import { KnowledgeBitReviewItem } from '../../knowledge-bit/knowledge-bit-review-item'
import {
  failedRecallBit,
  threeVariantBit,
  waitingBit,
} from '../../mocks/knowledge-bit-review.mock'

const meta: Meta<typeof KnowledgeBitReviewItem> = {
  title: 'Knowledge bit review/Suggestion card',
  component: KnowledgeBitReviewItem,
  tags: ['autodocs'],
  args: {
    bit: threeVariantBit,
    isResolving: false,
    pollingGaveUp: false,
    errorMessage: null,
    onApprove: fn(),
    onReject: fn(),
    onGrade: fn(),
    onSaveVariant: fn(async () => true),
    onSaveBit: fn(async () => true),
  },
  render: (args) => (
    <ul className="mx-auto max-w-xl">
      <KnowledgeBitReviewItem {...args} />
    </ul>
  ),
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'One suggested knowledge item as a card: the statement, its background note, the generated question cards, and approve or reject actions.',
      },
    },
  },
}

export default meta

type Story = StoryObj<typeof KnowledgeBitReviewItem>

export const PendingWithThreeVariants: Story = {
  parameters: {
    docs: {
      description: {
        story:
          'A basic front and back card, a why question and a fill-in-the-blank card, with a background note under the statement.',
      },
    },
  },
}

export const WaitingForQuestions: Story = {
  args: { bit: waitingBit },
  parameters: {
    docs: {
      description: {
        story:
          'The item has no question cards yet, so it shows a subtle pulsing waiting line. Approve is disabled until questions arrive.',
      },
    },
  },
}

export const FocusedCard: Story = {
  args: { isFocused: true },
  parameters: {
    docs: {
      description: {
        story:
          'The keyboard-focused card has a dark ring and border so the reviewer can see which item j, k, a and r act on.',
      },
    },
  },
}

export const ApproveFailed: Story = {
  args: {
    bit: failedRecallBit,
    errorMessage: "Couldn't approve. Try again.",
  },
  parameters: {
    docs: {
      description: {
        story:
          'The last approve request failed. The card stays listed and shows an inline error with the same actions available for a retry.',
      },
    },
  },
}

export const EditingCardInline: Story = {
  parameters: {
    docs: {
      description: {
        story:
          'The reviewer opened the basic card for editing. Its front and back become inputs, and approve and reject are disabled until the edit is saved or cancelled.',
      },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)

    await userEvent.click(canvas.getByTestId('knowledge-bit-review-edit-var-spacing-basic'))
  },
}
