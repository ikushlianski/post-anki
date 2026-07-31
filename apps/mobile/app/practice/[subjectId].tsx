import { useCallback, useEffect, useState } from "react";
import { useLocalSearchParams } from "expo-router";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import type { Phrase, PracticeAttempt } from "@post-anki/shared";
import { ApiRequestError } from "../../src/api/client";
import { generatePhraseBatch, submitAttempt } from "../../src/practice/practice.api";
import { PhraseView } from "../../src/practice/phrase-view";

export default function PracticeSubjectScreen() {
  const { subjectId } = useLocalSearchParams<{ subjectId: string }>();

  const [phrases, setPhrases] = useState<Phrase[] | null>(null);
  const [index, setIndex] = useState(0);
  const [generating, setGenerating] = useState(true);
  const [generateError, setGenerateError] = useState<string | null>(null);

  const [result, setResult] = useState<PracticeAttempt | null>(null);
  const [masteredNote, setMasteredNote] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const startBatch = useCallback(async () => {
    if (!subjectId) {
      return;
    }

    setGenerating(true);
    setGenerateError(null);
    setPhrases(null);
    setIndex(0);
    setResult(null);
    setMasteredNote(null);
    setSubmitError(null);

    try {
      const batch = await generatePhraseBatch(subjectId);
      setPhrases(batch);
    } catch (err) {
      if (!(err instanceof ApiRequestError && err.status === 401)) {
        setGenerateError("Couldn't generate a new batch. Check your connection and try again.");
      }
    } finally {
      setGenerating(false);
    }
  }, [subjectId]);

  useEffect(() => {
    void startBatch();
  }, [startBatch]);

  const currentPhrase = phrases && index < phrases.length ? phrases[index] : null;
  const batchComplete = phrases !== null && index >= phrases.length;

  async function handleSubmit(answer: string) {
    if (!subjectId || !currentPhrase) {
      return;
    }

    setSubmitting(true);
    setSubmitError(null);

    try {
      const res = await submitAttempt(subjectId, currentPhrase.id, answer);
      const attempt = res.attempts[0] ?? null;
      setResult(attempt);

      const mastered = res.phraseBankUpdates.find(
        (update) => update.status === "mastered" && update.id === currentPhrase.targetPhraseBankEntryId,
      );

      setMasteredNote(
        mastered ? `Mastered "${mastered.phraseText}" — moved to the phrase bank archive.` : null,
      );
    } catch (err) {
      if (!(err instanceof ApiRequestError && err.status === 401)) {
        setSubmitError("Couldn't submit your answer — it wasn't lost, try again.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  function handleNext() {
    setIndex((prev) => prev + 1);
    setResult(null);
    setMasteredNote(null);
    setSubmitError(null);
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.header}>Practice</Text>

      {generating ? <Text style={styles.muted}>Generating your batch…</Text> : null}

      {generateError ? (
        <View style={styles.errorBlock}>
          <Text style={styles.error}>{generateError}</Text>
          <Text style={styles.retryText} onPress={startBatch}>
            ↻ Retry
          </Text>
        </View>
      ) : null}

      {phrases && currentPhrase ? (
        <View>
          <Text style={styles.counter}>
            Phrase {index + 1} of {phrases.length}
          </Text>
          <PhraseView
            key={currentPhrase.id}
            phrase={currentPhrase}
            submitting={submitting}
            result={result}
            masteredNote={masteredNote}
            onSubmit={handleSubmit}
          />
          {submitError ? (
            <View style={styles.errorBlock}>
              <Text style={styles.error}>{submitError}</Text>
              <Text style={styles.retryText} onPress={() => setSubmitError(null)}>
                ↻ Try submitting again
              </Text>
            </View>
          ) : null}
          {result ? (
            <Text style={styles.retryText} onPress={handleNext}>
              Next phrase →
            </Text>
          ) : null}
        </View>
      ) : null}

      {batchComplete ? (
        <View style={styles.completeBlock}>
          <Text style={styles.completeText}>Batch complete.</Text>
          <Text style={styles.retryText} onPress={startBatch}>
            ↻ Practice again
          </Text>
        </View>
      ) : null}
    </ScrollView>
  );
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
  counter: {
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
  retryText: {
    color: "#2563eb",
    fontSize: 14,
    fontWeight: "600",
    marginTop: 12,
  },
  completeBlock: {
    marginTop: 16,
  },
  completeText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#111",
  },
});
