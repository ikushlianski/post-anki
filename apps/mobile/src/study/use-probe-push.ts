import { useCallback, useEffect, useRef, useState } from "react";
import type { DailyPushResponse, ProbeResult } from "@post-anki/shared";
import { ApiRequestError, apiFetch } from "../api/client";
import { submitProbeAnswer } from "./answer-submit";
import type { SelfOutcome } from "./score-quick-test";

export function useProbePush(subjectId?: string) {
  const [push, setPush] = useState<DailyPushResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [result, setResult] = useState<ProbeResult | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  // setSubmitting(true) alone doesn't guard against a genuine double-tap: two
  // native click events dispatched in the same synchronous tick both read
  // the pre-update `submitting` state, since React state updates aren't
  // applied until the next render. A ref is mutated immediately, so the
  // second call sees the first call's guard in the same tick.
  const submittingRef = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    setResult(null);
    setSubmitError(null);

    try {
      const query = subjectId ? `?subjectId=${encodeURIComponent(subjectId)}` : "";
      const data = await apiFetch<DailyPushResponse>(`/daily-push${query}`);
      setPush(data);
    } catch (err) {
      if (!(err instanceof ApiRequestError && err.status === 401)) {
        setLoadError("Couldn't reach Post Anki. Check your connection and try again.");
      }
    } finally {
      setLoading(false);
    }
  }, [subjectId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleSubmit(answer: string, selfOutcome?: SelfOutcome) {
    if (!push?.push || !push.question || submittingRef.current) {
      return;
    }

    submittingRef.current = true;
    setSubmitting(true);
    setSubmitError(null);

    try {
      const res = await submitProbeAnswer({
        topicId: push.push.topicId,
        gapId: push.question.gapId,
        mode: push.question.kind,
        answer,
        selfOutcome,
      });

      setResult(res);
    } catch (err) {
      if (!(err instanceof ApiRequestError && err.status === 401)) {
        setSubmitError("Couldn't submit your answer — it wasn't lost, try again.");
      }
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  return { push, loading, loadError, result, submitting, submitError, load, handleSubmit, setSubmitError };
}
