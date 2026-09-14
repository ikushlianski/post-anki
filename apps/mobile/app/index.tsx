import { router } from "expo-router";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useProbePush } from "../src/study/use-probe-push";
import { QuestionView } from "../src/study/question-view";

export default function TodayScreen() {
  const { push, loading, loadError, result, submitting, submitError, load, handleSubmit, setSubmitError } =
    useProbePush();

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
          <QuestionView
            question={push.question}
            submitting={submitting}
            onSubmit={handleSubmit}
          />
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
        Practice a subject →
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
