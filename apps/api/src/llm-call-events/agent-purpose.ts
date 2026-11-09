export type LlmPurpose = "cards" | "chat" | "other";

const PURPOSE_BY_AGENT: Record<string, LlmPurpose> = {
  studyChat: "chat",
  qaChat: "chat",
  globalCardChat: "chat",
  subjectChat: "chat",
  knowledgeBitChat: "chat",
  knowledgeBitChatDraft: "chat",
  knowledgeBitChatReword: "chat",
  knowledgeBitChatQueue: "chat",
  languageChat: "chat",
  cardsCompiler: "cards",
  knowledgeBitLessons: "cards",
  knowledgeBitSourceItems: "cards",
  knowledgeBitSourceItemsLegacy: "cards",
  knowledgeBitBusinessCards: "cards",
  knowledgeBitMeetingPhrase: "cards",
  knowledgeBitTagger: "cards",
  knowledgeBitQuestionGenerator: "cards",
  knowledgeBitFillBlankGenerator: "cards",
  knowledgeBitBasicCardGenerator: "cards",
  knowledgeBitExampleGenerator: "cards",
  knowledgeBitFollowupGenerator: "cards",
  cardStyleNotesDistiller: "cards",
  knowledgeSourceSubjectChecker: "cards",
  subjectAssignmentEscalation: "cards",
  cardDedupEscalation: "cards",
  subjectCreation: "cards",
  subjectSuggestionGrader: "cards",
  siblingDiscovery: "cards",
  tagAutoAssign: "cards",
  phraseBatchGenerate: "cards",
};

export function purposeForAgent(agentKey: string): LlmPurpose {
  return PURPOSE_BY_AGENT[agentKey] ?? "other";
}
