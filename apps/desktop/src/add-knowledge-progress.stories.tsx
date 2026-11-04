import type { Meta, StoryObj } from "@storybook/react-vite";
import type { AddedNote } from "@/add-knowledge-logic";
import { AddKnowledgeProgress } from "@/add-knowledge-progress";

const InFlight: AddedNote[] = [
  { sourceId: "source-1", label: "Anchor high, then trade concessions one at a time.", phase: "queued", cardCount: 0, polls: 0 },
  { sourceId: "source-2", label: "Silence after an offer often moves the other side.", phase: "working", cardCount: 0, polls: 2 },
];

const Settled: AddedNote[] = [
  { sourceId: "source-3", label: "Walk-away point before the meeting.", phase: "ready", cardCount: 3, polls: 4 },
  { sourceId: "source-4", label: "Small talk about the weather.", phase: "nothing", cardCount: 0, polls: 3 },
  { sourceId: "source-5", label: "Broken link", phase: "failed", cardCount: 0, polls: 2 },
  { sourceId: "source-6", label: "Long call transcript", phase: "slow", cardCount: 0, polls: 40 },
];

const meta = {
  title: "Desktop/Components/Add knowledge progress",
  component: AddKnowledgeProgress,
  args: { notes: InFlight, onReviewNew: () => undefined },
} satisfies Meta<typeof AddKnowledgeProgress>;

export default meta;

type Story = StoryObj<typeof meta>;

export const InFlightNotes: Story = {};

export const SettledNotes: Story = {
  args: { notes: Settled },
};

export const Hidden: Story = {
  args: { notes: [] },
};
