import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'

import { KnowledgeBitReviewSourceGroup } from '../../knowledge-bit/knowledge-bit-review-source-group'
import { threeItemSource } from '../../mocks/knowledge-bit-review.mock'

const meta: Meta<typeof KnowledgeBitReviewSourceGroup> = {
  title: 'Knowledge bit review/Source group regenerate',
  component: KnowledgeBitReviewSourceGroup,
  tags: ['autodocs'],
  args: {
    source: threeItemSource,
    focusedBitId: undefined,
    pollingGaveUp: false,
    rowErrors: {},
    isBitResolving: () => false,
    isConfirmingBulk: false,
    regeneration: undefined,
    regenerationActions: {
      onRequest: fn(),
      onCancel: fn(),
      onConfirm: fn(),
      onRetry: fn(),
    },
    onRequestApproveSource: fn(),
    onConfirmBulk: fn(),
    onCancelBulk: fn(),
    onEditingChange: fn(),
    onApprove: fn(),
    onReject: fn(),
    onGrade: fn(),
    onSaveVariant: fn(async () => true),
    onSaveBit: fn(async () => true),
  },
  render: (args) => (
    <ul className="mx-auto max-w-2xl">
      <KnowledgeBitReviewSourceGroup {...args} />
    </ul>
  ),
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'One source group with its Regenerate control. The control replaces only the undecided suggestions from this source.',
      },
    },
  },
}

export default meta

type Story = StoryObj<typeof KnowledgeBitReviewSourceGroup>

export const Idle: Story = {}

export const ConfirmingReplace: Story = {
  args: { regeneration: { phase: 'confirming' } },
}

export const Regenerating: Story = {
  args: {
    source: { ...threeItemSource, bits: [] },
    regeneration: { phase: 'running' },
  },
}

export const Failed: Story = {
  args: {
    source: { ...threeItemSource, bits: [] },
    regeneration: { phase: 'failed', message: "Couldn't regenerate. Try again." },
  },
}
