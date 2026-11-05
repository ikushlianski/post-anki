import type { AddKnowledgeRejection, SubjectRecommendation } from "@/api/add-knowledge-commands";
import type { Subject } from "@/api/desktop-commands";
import type { AdminSettings, Account, DailyGoal, SubjectStudyOptions } from "@/api/settings-commands";
import type { ReviewBatch, ReviewCard, SubjectDueCounts } from "@/api/review-commands";
import type { SubjectBitPage } from "@/api/subject-commands";
import type { ListPage, ListRow, TriageItem } from "@/api/triage-commands";

export const BUSINESS_SUBJECTS: Subject[] = [
  { id: "business", name: "Business", parentId: null },
  { id: "sales", name: "Sales", parentId: "business" },
  { id: "negotiation", name: "Negotiation", parentId: "business" },
  { id: "concessions", name: "Concessions", parentId: "negotiation" },
  { id: "loyalty", name: "Loyalty", parentId: "business" },
];

export const SUBJECT_BIT_PAGE: SubjectBitPage = {
  items: [
    {
      id: "bit-batna",
      question: "What is a BATNA?",
      answer: "Your best alternative if the deal fails. It sets your walk-away point.",
      state: "review",
      dueAt: "2026-11-02T09:00:00Z",
    },
    {
      id: "bit-anchor",
      question: "Why state the first offer first?",
      answer: "The opening number anchors the rest of the talk.",
      state: "review",
      dueAt: "2026-11-01T09:00:00Z",
    },
    {
      id: "bit-concession",
      question: "What should a concession always come with?",
      answer: "A request in return. Give nothing for free.",
      state: "new",
      dueAt: null,
    },
  ],
  hasMore: false,
};

const INTERVALS = { again: 60, hard: 600, good: 259200, easy: 604800 };

export const REVIEW_CARDS: ReviewCard[] = [
  {
    id: "card-batna",
    knowledgeBitId: "bit-batna",
    question: "In a negotiation, what is a BATNA?",
    answer: "Your best alternative if the deal fails. It sets your walk-away point.",
    phase: "review",
    cardKey: null,
    intervals: INTERVALS,
  },
  {
    id: "card-anchor",
    knowledgeBitId: "bit-anchor",
    question: "Why state the first offer first?",
    answer: "The opening number anchors the rest of the talk.",
    phase: "learning",
    cardKey: null,
    intervals: INTERVALS,
  },
  {
    id: "card-concession",
    knowledgeBitId: "bit-concession",
    question: "What should a concession always come with?",
    answer: "A request in return. Give nothing for free.",
    phase: "new",
    cardKey: null,
    intervals: INTERVALS,
  },
  {
    id: "card-discovery",
    knowledgeBitId: "bit-discovery",
    question: "What does a discovery question reveal?",
    answer: "The buyer's real pain, budget and timeline.",
    phase: "review",
    cardKey: null,
    intervals: INTERVALS,
  },
];

export const REVIEW_COUNTS_TOTAL = { new: 5, learning: 2, review: 9 };

export const REVIEW_BATCH: ReviewBatch = {
  cards: REVIEW_CARDS,
  offline: false,
  pending: 0,
  counts: REVIEW_COUNTS_TOTAL,
};

export const REVIEW_DUE_COUNTS: SubjectDueCounts = {
  subjects: [
    { subjectId: "sales", dueCount: 4, newCount: 2 },
    { subjectId: "negotiation", dueCount: 6, newCount: 3 },
    { subjectId: "concessions", dueCount: 1, newCount: 0 },
    { subjectId: "loyalty", dueCount: 0, newCount: 0 },
  ],
  unsorted: { dueCount: 2, newCount: 1 },
  newRemainingToday: 12,
};

export const TRIAGE_ITEMS: TriageItem[] = [
  {
    id: "triage-cost-of-waiting",
    body: "Lead with the cost of waiting, not the cost of the product.",
    background: "From a call note on enterprise renewals.",
    subjectName: null,
    suggestedSubjectName: "Sales",
  },
  {
    id: "triage-walk-away",
    body: "Write the walk-away point down before the meeting, not during it.",
    background: null,
    subjectName: "Negotiation",
    suggestedSubjectName: null,
  },
  {
    id: "triage-reward-second-purchase",
    body: "Loyalty rewards work best when they are spent on a second purchase.",
    background: "Article summary",
    subjectName: null,
    suggestedSubjectName: "Loyalty",
  },
];

function listRow(id: string, body: string, overrides: Partial<ListRow> = {}): ListRow {
  return {
    id,
    body,
    background: null,
    subjectName: "Negotiation",
    note: null,
    variantId: null,
    suspended: false,
    buried: false,
    ...overrides,
  };
}

function pageOf(items: ListRow[]): ListPage {
  return { items, hasMore: false };
}

export const INBOX_PAGE = pageOf([
  listRow("inbox-anchor", "Anchor high, then move in small steps.", { background: "Call with a supplier." }),
  listRow("inbox-discount", "A discount without a condition teaches the buyer to ask again.", { subjectName: "Sales" }),
]);

export const CHAT_PAGE = pageOf([
  listRow("chat-silence", "Silence after an offer often moves the other side first.", {
    note: "Ask me again next week",
  }),
]);

export const REJECTED_PAGE = pageOf([
  listRow("rejected-generic", "Negotiation is about winning the argument.", { note: "Too vague to study." }),
]);

export const SUSPENDED_PAGE = pageOf([
  listRow("suspended-batna", "BATNA means always having a better deal ready.", {
    note: "Suspended while the course is paused",
    variantId: "variant-batna",
    suspended: true,
  }),
]);

export const EMPTY_PAGE: ListPage = { items: [], hasMore: false };

export const ADD_KNOWLEDGE_TEXT = "Anchor high, then trade concessions one at a time.";

export const RECOMMENDATIONS: SubjectRecommendation[] = [
  {
    subjectId: "negotiation",
    subjectLabel: "Business / Negotiation",
    confidence: "high",
    reason: "Mentions anchoring and trading concessions.",
  },
  {
    subjectId: "sales",
    subjectLabel: "Business / Sales",
    confidence: "medium",
    reason: "Could apply to a sales call.",
  },
];

export const DUPLICATE_REJECTION: AddKnowledgeRejection = {
  kind: "duplicate",
  message: "This matches a card you already have.",
};

export const ACCOUNT: Account = {
  email: "sam@example.com",
  name: "Sam Rivera",
  lastSignInAt: "2026-10-29T09:12:00Z",
};

export const DAILY_GOAL: DailyGoal = { dailyReviewTarget: 40 };

export const ADMIN_SETTINGS: AdminSettings = {
  modelTier: "balanced",
  newCardsPerDay: 20,
  mixNewWithDue: true,
  learningStepsMinutes: [1, 10],
  relearningStepsMinutes: [10],
  desiredRetention: 0.9,
};

export const NEGOTIATION_STUDY_OPTIONS: SubjectStudyOptions = {
  own: {
    newCardsPerDay: 8,
    learningStepsMinutes: null,
    relearningStepsMinutes: null,
    desiredRetention: null,
    studyIntent: "exam",
    examDate: "2026-12-15",
    detailLevel: "standard",
    hintingEnabled: true,
  },
  intent: { studyIntent: "exam", examDate: "2026-12-15" },
  effective: {
    newCardsPerDay: 8,
    learningStepsMinutes: [1, 10],
    relearningStepsMinutes: [10],
    desiredRetention: 0.9,
  },
};

export const SAMPLE_BACKEND: Record<string, unknown> = {
  get_subjects: BUSINESS_SUBJECTS,
  get_subject_bits: SUBJECT_BIT_PAGE,
  get_review_due_counts: REVIEW_DUE_COUNTS,
  get_due_cards: REVIEW_BATCH,
  sync_pending_grades: { pending: 0 },
  get_triage_items: TRIAGE_ITEMS,
  list_inbox_items: INBOX_PAGE,
  list_chat_items: CHAT_PAGE,
  list_rejected_items: REJECTED_PAGE,
  list_suspended_items: SUSPENDED_PAGE,
  check_knowledge_subject: { status: "ok", recommendations: RECOMMENDATIONS },
  add_knowledge: { sourceId: "source-negotiation", truncated: false },
  get_knowledge_source_status: { status: "running", failureReason: null, cardCount: null },
  get_account: ACCOUNT,
  get_daily_goal: DAILY_GOAL,
  get_admin_settings: ADMIN_SETTINGS,
  get_subject_study_options: NEGOTIATION_STUDY_OPTIONS,
};
