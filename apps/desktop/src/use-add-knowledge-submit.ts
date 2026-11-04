import { useEffect, useState } from "react";
import {
  addKnowledge,
  checkKnowledgeSubject,
  type SubjectAdvice,
  type SubjectRecommendation,
} from "@/api/add-knowledge-commands";
import {
  canSubmit,
  isDuplicateRejection,
  labelFromText,
  recommendationsFrom,
  rejectionMessage,
} from "@/add-knowledge-logic";
import { readDraft, writeDraft } from "@/add-knowledge-draft";

export interface SubmitAttempt {
  text: string;
  subjectId: string;
  unfiled: boolean;
}

export interface SavedNotice {
  unfiled: boolean;
  truncated: boolean;
}

const UNAVAILABLE_ADVICE: SubjectAdvice = { status: "unavailable", reason: "failed" };
const SAVE_FAILED = "Could not save the knowledge. Try again.";

export function useAddKnowledgeSubmit(input: {
  knownSubjectIds: string[];
  onTracked: (added: { sourceId: string; label: string }[]) => void;
}) {
  const { knownSubjectIds, onTracked } = input;
  const draft = readDraft();
  const [text, setText] = useState(draft.text);
  const [rawSubjectId, setRawSubjectId] = useState(draft.subjectId);
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [duplicate, setDuplicate] = useState<SubmitAttempt | null>(null);
  const [advice, setAdvice] = useState<SubjectRecommendation[] | null>(null);
  const [saved, setSaved] = useState<SavedNotice | null>(null);

  const subjectId = knownSubjectIds.includes(rawSubjectId) ? rawSubjectId : "";

  useEffect(() => {
    writeDraft({ text, subjectId });
  }, [text, subjectId]);

  async function save(attempt: SubmitAttempt, force: boolean) {
    setBusy(true);
    setError(null);
    setDuplicate(null);
    setSaved(null);

    try {
      const added = await addKnowledge({
        subjectId: attempt.subjectId === "" ? null : attempt.subjectId,
        text: attempt.text,
        force,
      });

      onTracked([{ sourceId: added.sourceId, label: labelFromText(attempt.text) }]);
      setText((current) => (current.trim() === attempt.text ? "" : current));
      setSaved({ unfiled: attempt.unfiled, truncated: added.truncated });
    } catch (reason) {
      if (isDuplicateRejection(reason)) {
        setDuplicate(attempt);
      }

      setError(rejectionMessage(reason, SAVE_FAILED));
    } finally {
      setBusy(false);
    }
  }

  async function submit() {
    if (advice !== null || !canSubmit(text, busy || checking)) {
      return;
    }

    const trimmed = text.trim();

    if (subjectId !== "") {
      await save({ text: trimmed, subjectId, unfiled: false }, false);

      return;
    }

    setChecking(true);
    setError(null);
    setSaved(null);
    setDuplicate(null);

    const outcome = await checkKnowledgeSubject(trimmed).catch(() => UNAVAILABLE_ADVICE);

    setChecking(false);

    const recommendations = recommendationsFrom(outcome);

    if (recommendations.length > 0) {
      setAdvice(recommendations);

      return;
    }

    await save({ text: trimmed, subjectId: "", unfiled: true }, false);
  }

  async function acceptSuggestion(chosenId: string) {
    setRawSubjectId(chosenId);
    setAdvice(null);
    await save({ text: text.trim(), subjectId: chosenId, unfiled: false }, false);
  }

  async function addWithoutSubject() {
    setAdvice(null);
    await save({ text: text.trim(), subjectId: "", unfiled: true }, false);
  }

  async function addAnyway() {
    if (duplicate !== null) {
      await save(duplicate, true);
    }
  }

  function changeText(value: string) {
    setText(value);
    setDuplicate(null);
    setError(null);
  }

  return {
    text,
    subjectId,
    busy,
    checking,
    error,
    advice,
    saved,
    canAddAnyway: duplicate !== null,
    canSubmit: advice === null && canSubmit(text, busy || checking),
    changeText,
    changeSubject: setRawSubjectId,
    dismissAdvice: () => setAdvice(null),
    submit,
    acceptSuggestion,
    addWithoutSubject,
    addAnyway,
  };
}
