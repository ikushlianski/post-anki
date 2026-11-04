import type { Meta, StoryObj } from "@storybook/react-vite";
import { ReviewScopeControls } from "@/review-scope-controls";
import { BUSINESS_SUBJECTS, REVIEW_DUE_COUNTS } from "@/storybook-sample-data";

const meta = {
  title: "Desktop/Components/Review scope picker",
  component: ReviewScopeControls,
  args: {
    subjects: BUSINESS_SUBJECTS,
    counts: REVIEW_DUE_COUNTS,
    subjectId: null,
    aheadDays: 0,
    disabled: false,
    onSubjectChange: () => undefined,
    onAheadChange: () => undefined,
  },
} satisfies Meta<typeof ReviewScopeControls>;

export default meta;

type Story = StoryObj<typeof meta>;

export const AllSubjects: Story = {};

export const NegotiationWithLearnAhead: Story = {
  args: { subjectId: "negotiation", aheadDays: 3 },
};

export const Disabled: Story = {
  args: { subjectId: "sales", disabled: true },
};
