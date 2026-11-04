import type { Meta, StoryObj } from "@storybook/react-vite";
import { SubjectNameForm } from "@/subject-name-form";

const meta = {
  title: "Desktop/Components/Subject name form",
  component: SubjectNameForm,
  args: {
    label: "New subject name",
    initialValue: "",
    submitLabel: "Create",
    onSubmit: () => Promise.resolve(),
    onCancel: () => undefined,
  },
} satisfies Meta<typeof SubjectNameForm>;

export default meta;

type Story = StoryObj<typeof meta>;

export const NewSubject: Story = {};

export const Rename: Story = {
  args: { label: "Subject name", initialValue: "Negotiation", submitLabel: "Save" },
};
