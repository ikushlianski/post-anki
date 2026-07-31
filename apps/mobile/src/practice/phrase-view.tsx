import { useState } from "react";
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import type { Phrase, PracticeAttempt } from "@post-anki/shared";

const VERDICT_LABELS: Record<string, string> = {
  Ok: "Ok",
  NeedsReview: "Needs review",
  NeedsDeepDive: "Needs deep dive",
};

export function PhraseView({
  phrase,
  submitting,
  result,
  masteredNote,
  onSubmit,
}: {
  phrase: Phrase;
  submitting: boolean;
  result: PracticeAttempt | null;
  masteredNote: string | null;
  onSubmit: (answer: string) => void;
}) {
  const [answer, setAnswer] = useState("");
  const graded = result !== null;

  return (
    <View>
      <View style={styles.tagRow}>
        {phrase.targetPhraseBankEntryId ? (
          <Text style={styles.recycledBadge}>Recycled</Text>
        ) : null}
        <Text style={styles.domainBadge}>{phrase.domain}</Text>
      </View>
      <Text style={styles.prompt}>{phrase.russian}</Text>
      <TextInput
        style={styles.input}
        multiline
        editable={!submitting && !graded}
        value={answer}
        onChangeText={setAnswer}
        placeholder="Your English translation…"
      />
      {!graded ? (
        <TouchableOpacity
          disabled={submitting || answer.trim().length === 0}
          style={[
            styles.submitButton,
            (submitting || answer.trim().length === 0) && styles.submitButtonDisabled,
          ]}
          onPress={() => onSubmit(answer)}
        >
          <Text style={styles.submitText}>{submitting ? "Submitting…" : "Submit"}</Text>
        </TouchableOpacity>
      ) : null}

      {result ? (
        <View style={styles.resultBlock}>
          <Text style={styles.resultHeader}>
            {result.score}/10 · {VERDICT_LABELS[result.verdict] ?? result.verdict}
          </Text>
          <Text style={styles.feedback}>{result.feedback}</Text>
          {masteredNote ? <Text style={styles.masteredNote}>{masteredNote}</Text> : null}
          {result.nativeAlternatives.length > 0 ? (
            <View style={styles.alternatives}>
              {result.nativeAlternatives.map((alt) => (
                <Text key={alt} style={styles.alternative}>
                  · {alt}
                </Text>
              ))}
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  tagRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 8,
  },
  recycledBadge: {
    fontSize: 11,
    color: "#0369a1",
    backgroundColor: "#f0f9ff",
    borderWidth: 1,
    borderColor: "#7dd3fc",
    borderRadius: 999,
    paddingVertical: 2,
    paddingHorizontal: 8,
  },
  domainBadge: {
    fontSize: 11,
    color: "#666",
    backgroundColor: "#f3f4f6",
    borderRadius: 999,
    paddingVertical: 2,
    paddingHorizontal: 8,
  },
  prompt: {
    fontSize: 18,
    color: "#111",
    marginBottom: 12,
  },
  input: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
    padding: 12,
    minHeight: 60,
    fontSize: 14,
    textAlignVertical: "top",
    marginBottom: 12,
  },
  submitButton: {
    backgroundColor: "#059669",
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: "center",
  },
  submitButtonDisabled: {
    opacity: 0.5,
  },
  submitText: {
    color: "#fff",
    fontWeight: "600",
  },
  resultBlock: {
    marginTop: 12,
    padding: 12,
    borderRadius: 8,
    backgroundColor: "#f9fafb",
  },
  resultHeader: {
    fontSize: 15,
    fontWeight: "700",
    color: "#111",
    marginBottom: 6,
  },
  feedback: {
    fontSize: 14,
    color: "#333",
  },
  masteredNote: {
    marginTop: 8,
    fontSize: 13,
    fontWeight: "600",
    color: "#047857",
  },
  alternatives: {
    marginTop: 8,
  },
  alternative: {
    fontSize: 13,
    color: "#555",
  },
});
