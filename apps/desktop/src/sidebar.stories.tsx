import type { Meta, StoryObj } from "@storybook/react-vite";
import { Sidebar } from "@/sidebar";

const meta = {
  title: "Desktop/Components/Sidebar",
  component: Sidebar,
  args: {
    active: "subjects",
    onSelect: () => undefined,
  },
  render: (args) => (
    <div className="grid h-[420px] w-[232px]">
      <Sidebar {...args} />
    </div>
  ),
} satisfies Meta<typeof Sidebar>;

export default meta;

type Story = StoryObj<typeof meta>;

export const SubjectsActive: Story = {};

export const ReviewActive: Story = {
  args: { active: "review" },
};
