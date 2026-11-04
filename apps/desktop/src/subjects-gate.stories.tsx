import type { Meta, StoryObj } from "@storybook/react-vite";
import { SubjectsGate } from "@/subjects-gate";

const meta = {
  title: "Desktop/Components/Subjects gate",
  component: SubjectsGate,
  args: {
    state: { status: "loading" },
    children: () => null,
  },
} satisfies Meta<typeof SubjectsGate>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Loading: Story = {};

export const Offline: Story = {
  args: { state: { status: "offline" } },
};
