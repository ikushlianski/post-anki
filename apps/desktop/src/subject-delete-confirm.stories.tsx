import type { Meta, StoryObj } from "@storybook/react-vite";
import { SubjectDeleteConfirm } from "@/subject-delete-confirm";

const meta = {
  title: "Desktop/Components/Subject delete confirm",
  component: SubjectDeleteConfirm,
  args: {
    name: "Loyalty",
    subSubjectCount: 0,
    onConfirm: () => Promise.resolve(),
    onCancel: () => undefined,
  },
} satisfies Meta<typeof SubjectDeleteConfirm>;

export default meta;

type Story = StoryObj<typeof meta>;

export const NoSubSubjects: Story = {};

export const WithSubSubjects: Story = {
  args: { name: "Negotiation", subSubjectCount: 2 },
};
