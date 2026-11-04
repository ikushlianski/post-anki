import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, within } from "storybook/test";
import { AddKnowledgeView } from "@/add-knowledge-view";
import {
  ADD_KNOWLEDGE_TEXT,
  BUSINESS_SUBJECTS,
  DUPLICATE_REJECTION,
  SAMPLE_BACKEND,
} from "@/storybook-sample-data";

const meta = {
  title: "Desktop/Pages/Add knowledge",
  component: AddKnowledgeView,
  args: {
    subjects: BUSINESS_SUBJECTS,
    onReviewNew: () => undefined,
  },
  parameters: { tauriMocks: SAMPLE_BACKEND },
} satisfies Meta<typeof AddKnowledgeView>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Idle: Story = {};

export const SubjectSuggestion: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await userEvent.type(canvas.getByRole("textbox"), ADD_KNOWLEDGE_TEXT);
    await userEvent.click(canvas.getByRole("button", { name: "Add knowledge" }));
    await canvas.findByRole("region", { name: "Suggested subjects" });
  },
};

export const DuplicateAddAnyway: Story = {
  parameters: {
    tauriMocks: {
      ...SAMPLE_BACKEND,
      add_knowledge: ({ force }: Record<string, unknown> = {}) =>
        force === true ? { sourceId: "source-duplicate", truncated: false } : { __error: DUPLICATE_REJECTION },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await userEvent.selectOptions(canvas.getByRole("combobox"), "negotiation");
    await userEvent.type(canvas.getByRole("textbox"), ADD_KNOWLEDGE_TEXT);
    await userEvent.click(canvas.getByRole("button", { name: "Add knowledge" }));
    await canvas.findByRole("button", { name: "Add anyway" });
    await expect(canvas.getByRole("alert")).toHaveTextContent(DUPLICATE_REJECTION.message);
  },
};

export const SavedWithProgress: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await userEvent.selectOptions(canvas.getByRole("combobox"), "negotiation");
    await userEvent.type(canvas.getByRole("textbox"), ADD_KNOWLEDGE_TEXT);
    await userEvent.click(canvas.getByRole("button", { name: "Add knowledge" }));
    await canvas.findByText(/Saved\./);
    await canvas.findByRole("button", { name: "Review new items" });
  },
};
