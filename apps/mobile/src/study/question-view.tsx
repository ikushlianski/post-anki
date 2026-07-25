import { useState } from "react";
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import type { ProbeQuestion } from "@post-anki/shared";

export function QuestionView({
  question,
  submitting,
  onSubmit,
}: {
  question: ProbeQuestion;
  submitting: boolean;
  onSubmit: (answer: string) => void;
}) {
  if (question.kind === "quick_test") {
    return <QuickTestQuestion question={question} submitting={submitting} onSubmit={onSubmit} />;
  }

  return <SocraticQuestion question={question} submitting={submitting} onSubmit={onSubmit} />;
}

function QuickTestQuestion({
  question,
  submitting,
  onSubmit,
}: {
  question: ProbeQuestion;
  submitting: boolean;
  onSubmit: (answer: string) => void;
}) {
  const [selected, setSelected] = useState<number | null>(null);

  return (
    <View>
      <Prompt question={question} />
      <View style={styles.options}>
        {(question.options ?? []).map((option, index) => (
          <TouchableOpacity
            key={index}
            disabled={submitting}
            style={[styles.option, selected === index && styles.optionSelected]}
            onPress={() => {
              setSelected(index);
              onSubmit(String(index));
            }}
          >
            <Text style={styles.optionText}>{option}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

function SocraticQuestion({
  question,
  submitting,
  onSubmit,
}: {
  question: ProbeQuestion;
  submitting: boolean;
  onSubmit: (answer: string) => void;
}) {
  const [answer, setAnswer] = useState("");

  return (
    <View>
      <Prompt question={question} />
      <TextInput
        style={styles.input}
        multiline
        editable={!submitting}
        value={answer}
        onChangeText={setAnswer}
        placeholder="Reason it through — say more than was asked."
      />
      <TouchableOpacity
        disabled={submitting || answer.trim().length === 0}
        style={[styles.submitButton, (submitting || answer.trim().length === 0) && styles.submitButtonDisabled]}
        onPress={() => onSubmit(answer)}
      >
        <Text style={styles.submitText}>Submit answer</Text>
      </TouchableOpacity>
    </View>
  );
}

function Prompt({ question }: { question: ProbeQuestion }) {
  return (
    <View style={styles.promptBlock}>
      {question.gapLabel ? (
        <Text style={styles.gapLabel}>gap: {question.gapLabel}</Text>
      ) : (
        <Text style={styles.openingNote}>
          Opening question — your answer helps map what you already know.
        </Text>
      )}
      <Text style={styles.prompt}>{question.prompt}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  promptBlock: {
    marginBottom: 16,
  },
  gapLabel: {
    fontSize: 12,
    color: "#888",
    marginBottom: 4,
  },
  openingNote: {
    fontSize: 12,
    color: "#888",
    marginBottom: 4,
  },
  prompt: {
    fontSize: 16,
    color: "#111",
  },
  options: {
    gap: 8,
  },
  option: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  optionSelected: {
    borderColor: "#3b82f6",
    backgroundColor: "#eff6ff",
  },
  optionText: {
    fontSize: 14,
    color: "#111",
  },
  input: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
    padding: 12,
    minHeight: 80,
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
});
