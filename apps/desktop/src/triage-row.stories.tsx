import type { Meta, StoryObj } from "@storybook/react-vite";
import { TriageRowCard } from "@/triage-row";
import { actionsClass, listClass } from "@/triage-classes";

const meta = {
  title: "Desktop/Components/Triage row",
  component: TriageRowCard,
  args: {
    body: "Lead with the cost of waiting, not the cost of the product.",
    background: "From a call note on enterprise renewals.",
    meta: "Subject: Sales (suggested)",
  },
  render: (args) => (
    <ul className={listClass}>
      <TriageRowCard {...args} />
    </ul>
  ),
} satisfies Meta<typeof TriageRowCard>;

export default meta;

type Story = StoryObj<typeof meta>;

export const BodyOnly: Story = {
  args: { background: null, meta: null },
};

export const WithActions: Story = {
  args: {
    children: (
      <div className={actionsClass}>
        <button type="button" className="btn">
          Back to triage
        </button>
        <button type="button" className="btn btn-primary">
          Approve
        </button>
      </div>
    ),
  },
};
