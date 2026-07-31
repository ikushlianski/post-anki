import { useCallback, useEffect, useState } from "react";
import { router } from "expo-router";
import { RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import type { Subject } from "@post-anki/shared";
import { ApiRequestError } from "../../src/api/client";
import { getSubjects } from "../../src/subject/subject-list.api";
import { getPhraseBankDueCount } from "../../src/practice/practice.api";

interface SubjectRow {
  subject: Subject;
  dueCount: number;
}

export default function PracticeSubjectListScreen() {
  const [rows, setRows] = useState<SubjectRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);

    try {
      const subjects = await getSubjects();
      const languageSubjects = subjects.filter((s) => s.kind === "language-practice");

      const dueCounts = await Promise.all(
        languageSubjects.map((subject) => getPhraseBankDueCount(subject.id)),
      );

      setRows(languageSubjects.map((subject, index) => ({ subject, dueCount: dueCounts[index] ?? 0 })));
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

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
    >
      <Text style={styles.header}>Practice</Text>

      {loading && !rows ? <Text style={styles.muted}>Loading subjects…</Text> : null}

      {loadError ? (
        <View style={styles.errorBlock}>
          <Text style={styles.error}>{loadError}</Text>
          <Text style={styles.retryText} onPress={load}>
            ↻ Retry
          </Text>
        </View>
      ) : null}

      {!loading && !loadError && rows && rows.length === 0 ? (
        <Text style={styles.muted}>No language-practice subjects yet.</Text>
      ) : null}

      {rows && rows.length > 0
        ? rows.map(({ subject, dueCount }) => (
            <TouchableOpacity
              key={subject.id}
              style={styles.row}
              onPress={() => router.push(`/practice/${subject.id}`)}
            >
              <Text style={styles.subjectName}>{subject.name}</Text>
              <Text style={dueCount > 0 ? styles.dueBadge : styles.startBadge}>
                {dueCount > 0 ? `${dueCount} due` : "Start a new batch"}
              </Text>
            </TouchableOpacity>
          ))
        : null}
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
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 8,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 10,
  },
  subjectName: {
    fontSize: 15,
    color: "#111",
    fontWeight: "600",
  },
  dueBadge: {
    fontSize: 13,
    color: "#b45309",
    fontWeight: "600",
  },
  startBadge: {
    fontSize: 13,
    color: "#888",
  },
});
