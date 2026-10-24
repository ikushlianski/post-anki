import type { Meta, StoryObj } from '@storybook/react-vite'

import { KnowledgeBitFocusCard } from '../../knowledge-bit/knowledge-bit-focus-card'
import { KnowledgeBitFocusDone } from '../../knowledge-bit/knowledge-bit-focus-done'
import { KnowledgeBitFocusShell } from '../../knowledge-bit/knowledge-bit-focus-shell'
import { threeVariantBit } from '../../mocks/knowledge-bit-review.mock'

const meta: Meta<typeof KnowledgeBitFocusShell> = {
  title: 'Knowledge bit review/Focus mode',
  component: KnowledgeBitFocusShell,
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Full-screen triage: one card at a time with Reject on the left and Approve on the right.',
      },
    },
  },
}

export default meta

type Story = StoryObj<typeof KnowledgeBitFocusShell>

const noop = () => undefined
const saved = () => Promise.resolve(true)

export const OneCard: Story = {
  args: { readyCount: 3, waitingCount: 0, canUndo: true, onUndo: noop, onFinish: noop },
  render: (args) => (
    <KnowledgeBitFocusShell {...args}>
      <KnowledgeBitFocusCard
        bit={threeVariantBit}
        subjectName="Databases"
        sourceText="Turbopuffer uses a WAL-first design so writes are durable before indexing."
        isResolving={false}
        onApprove={noop}
        onReject={noop}
        onSaveVariant={saved}
        onSaveBit={saved}
      />
    </KnowledgeBitFocusShell>
  ),
}

export const AllDecided: Story = {
  args: { readyCount: 0, waitingCount: 0, canUndo: true, onUndo: noop, onFinish: noop },
  render: (args) => (
    <KnowledgeBitFocusShell {...args}>
      <KnowledgeBitFocusDone waitingCount={0} decidedCount={3} onFinish={noop} />
    </KnowledgeBitFocusShell>
  ),
}

export const WaitingForMoreCards: Story = {
  args: { readyCount: 0, waitingCount: 2, canUndo: false, onUndo: noop, onFinish: noop },
  render: (args) => (
    <KnowledgeBitFocusShell {...args}>
      <KnowledgeBitFocusDone waitingCount={2} decidedCount={1} onFinish={noop} />
    </KnowledgeBitFocusShell>
  ),
}
