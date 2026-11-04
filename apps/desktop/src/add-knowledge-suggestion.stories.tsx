import type { Meta, StoryObj } from "@storybook/react-vite";
import { AddKnowledgeSuggestion } from "@/add-knowledge-suggestion";
import { RECOMMENDATIONS } from "@/storybook-sample-data";

const meta = {
  title: "Desktop/Components/Add knowledge suggestion",
  component: AddKnowledgeSuggestion,
  args: {
    recommendations: RECOMMENDATIONS,
    busy: false,
    onUse: () => undefined,
    onPickAnother: () => undefined,
    onAddWithoutSubject: () => undefined,
  },
} satisfies Meta<typeof AddKnowledgeSuggestion>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Ready: Story = {};

export const Busy: Story = {
  args: { busy: true },
};
