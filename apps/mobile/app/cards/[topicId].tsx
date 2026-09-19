import { useLocalSearchParams } from "expo-router";
import { eq, useLiveQuery } from "@tanstack/react-db";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import {
  topicCardSetsCollection,
  topicCardsCollection,
  topicCardVariantsCollection,
} from "../../src/cards/cards.collection";
import { groupTopicCardRows } from "../../src/cards/group-topic-cards";

export default function TopicCardsScreen() {
  const { topicId } = useLocalSearchParams<{ topicId: string }>();

  const { data, isLoading } = useLiveQuery(
    (q) =>
      q
        .from({ sets: topicCardSetsCollection })
        .join(
          { cards: topicCardsCollection },
          ({ sets, cards }) => eq(sets.id, cards.card_set_id),
          "inner",
        )
        .join(
          { variants: topicCardVariantsCollection },
          ({ cards, variants }) => eq(cards.id, variants.card_id),
          "inner",
        )
        .where(({ sets }) => eq(sets.topic_id, topicId)),
    [topicId],
  );

  const cards = groupTopicCardRows(data ?? []);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.header}>Cards</Text>

      {isLoading && cards.length === 0 ? (
        <Text style={styles.muted}>Loading cards…</Text>
      ) : null}

      {!isLoading && cards.length === 0 ? (
        <Text style={styles.muted}>No cards yet for this topic.</Text>
      ) : null}

      {cards.map((card) => (
        <View key={card.cardId} style={styles.card}>
          <Text style={styles.concept}>{card.concept}</Text>
          {card.variants.map((variant, index) => (
            <View key={index} style={styles.variant}>
              <Text style={styles.prompt}>{variant.prompt}</Text>
              <Text style={styles.answer}>{variant.answer}</Text>
            </View>
          ))}
        </View>
      ))}
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
  card: {
    marginBottom: 20,
  },
  concept: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111",
    marginBottom: 8,
  },
  variant: {
    marginBottom: 8,
    paddingLeft: 8,
  },
  prompt: {
    fontSize: 14,
    color: "#111",
  },
  answer: {
    fontSize: 14,
    color: "#555",
    marginTop: 2,
  },
});
