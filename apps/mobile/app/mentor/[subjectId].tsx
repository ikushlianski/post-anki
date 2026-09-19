import { router, useLocalSearchParams } from "expo-router";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useProbePush } from "../../src/study/use-probe-push";
import { QuestionView } from "../../src/study/question-view";

export default function MentorSubjectScreen() {
  const { subjectId } = useLocalSearchParams<{ subjectId: string }>();
  const { push, loading, loadError, result, submitting, submitError, load, handleSubmit, setSubmitError } =
    useProbePush(subjectId);

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
    >
      <Text style={styles.header}>Practice</Text>

      {loading && !push ? <Text style={styles.muted}>Loading a question…</Text> : null}

      {loadError ? (
        <View style={styles.errorBlock}>
          <Text style={styles.error}>{loadError}</Text>
          <RetryLink label="↻ Retry" onPress={load} />
        </View>
      ) : null}

      {!loading && !loadError && push && !push.push ? (
        <Text style={styles.muted}>Nothing to review here yet — check back later.</Text>
      ) : null}

      {push?.question && !result ? (
        <View>
          {push.push ? (
            <View>
              <Text style={styles.context}>
                {push.push.curriculumName} · {push.push.topicTitle}
              </Text>
              <Text
                style={styles.cardsLink}
                onPress={() => router.push(`/cards/${push.push!.topicId}`)}
              >
                View cards for this topic →
              </Text>
            </View>
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
          <RetryLink label="↻ New question" onPress={load} />
        </View>
      ) : null}
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
  cardsLink: {
    color: "#2563eb",
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 12,
  },
});
