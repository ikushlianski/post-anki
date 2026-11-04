import type { Meta, StoryObj } from "@storybook/react-vite";
import { SubjectRow } from "@/subject-row";
import { BUSINESS_SUBJECTS } from "@/storybook-sample-data";

const negotiation = BUSINESS_SUBJECTS[2];
const concessions = BUSINESS_SUBJECTS[3];

const meta = {
  title: "Desktop/Components/Subject row",
  component: SubjectRow,
  args: {
    subject: negotiation,
    depth: 0,
    hasChildren: true,
    isOpen: false,
    onToggle: () => undefined,
    onReview: () => undefined,
    onOpen: () => undefined,
    onAddChild: () => undefined,
  },
  render: (args) => (
    <ul className="list-group max-w-page">
      <SubjectRow {...args} />
    </ul>
  ),
} satisfies Meta<typeof SubjectRow>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Collapsed: Story = {};

export const Expanded: Story = {
  args: { isOpen: true },
};

export const NestedLeaf: Story = {
  args: { subject: concessions, depth: 2, hasChildren: false },
};
