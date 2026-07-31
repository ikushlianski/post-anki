import { useCallback, useEffect, useRef, useState } from "react";
import { router } from "expo-router";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import type { DailyPushResponse, ProbeResult } from "@post-anki/shared";
import { ApiRequestError, apiFetch } from "../src/api/client";
import { submitProbeAnswer } from "../src/study/answer-submit";
import { QuestionView } from "../src/study/question-view";

export default function TodayScreen() {
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
      const data = await apiFetch<DailyPushResponse>("/daily-push");
      setPush(data);
    } catch (err) {
      if (!(err instanceof ApiRequestError && err.status === 401)) {
        setLoadError("Couldn't reach Post Anki. Check your connection and try again.");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleSubmit(answer: string) {
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

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
    >
      <Text style={styles.header}>Today</Text>

      {loading && !push ? <Text style={styles.muted}>Loading today's question…</Text> : null}

      {loadError ? (
        <View style={styles.errorBlock}>
          <Text style={styles.error}>{loadError}</Text>
          <RetryLink label="↻ Retry" onPress={load} />
        </View>
      ) : null}

      {!loading && !loadError && push && !push.push ? (
        <Text style={styles.muted}>Nothing to review yet — check back later.</Text>
      ) : null}

      {push?.question && !result ? (
        <View>
          {push.push ? (
            <Text style={styles.context}>
              {push.push.curriculumName} · {push.push.topicTitle}
            </Text>
          ) : null}
          <QuestionView question={push.question} submitting={submitting} onSubmit={handleSubmit} />
          {submitError ? (
            <View style={styles.errorBlock}>
              <Text style={styles.error}>{submitError}</Text>
              <RetryLink label="↻ Try submitting again" onPress={() => setSubmitError(null)} />
            </View>
          ) : null}
        </View>
      ) : null}

      {result ? (
        <View style={styles.resultBlock}>
          <Text style={[styles.resultText, result.outcome === "pass" ? styles.pass : styles.fail]}>
            {result.feedback}
          </Text>
          <RetryLink label="↻ New push" onPress={load} />
        </View>
      ) : null}

      <Text style={styles.practiceLink} onPress={() => router.push("/practice")}>
        Practice a language subject →
      </Text>
    </ScrollView>
  );
}

function RetryLink({ label, onPress }: { label: string; onPress: () => void }) {
  return <Text style={styles.retryText} onPress={onPress}>{label}</Text>;
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    padding: 20,
    backgroundColor: "#fff",
  },
  header: {
    fontSize: 22,
    fontWeight: "700",
    marginBottom: 16,
    color: "#111",
  },
  muted: {
    fontSize: 14,
    color: "#888",
  },
  context: {
    fontSize: 12,
    color: "#888",
    marginBottom: 8,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  errorBlock: {
    marginTop: 8,
    marginBottom: 16,
  },
  error: {
    color: "#b91c1c",
    fontSize: 13,
    marginBottom: 8,
  },
  resultBlock: {
    marginTop: 16,
  },
  resultText: {
    fontSize: 15,
    fontWeight: "600",
    marginBottom: 12,
  },
  pass: {
    color: "#047857",
  },
  fail: {
    color: "#b45309",
  },
  retryText: {
    color: "#2563eb",
    fontSize: 14,
    fontWeight: "600",
  },
  practiceLink: {
    marginTop: 24,
    color: "#2563eb",
    fontSize: 14,
    fontWeight: "600",
  },
});
