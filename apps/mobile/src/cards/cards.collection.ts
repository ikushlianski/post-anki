import { createCollection } from "@tanstack/react-db";
import { electricCollectionOptions } from "@tanstack/electric-db-collection";
import { apiBaseUrl, assertSecureUrl } from "../api/client";
import { getStoredToken } from "../api/token-storage";

const SHAPE_URL = `${apiBaseUrl()}/electric/v1/shape`;

assertSecureUrl(SHAPE_URL);

export async function authorizationHeader(): Promise<string> {
  const token = await getStoredToken();

  return token ? `Bearer ${token}` : "";
}

export interface TopicCardSetRow {
  [key: string]: unknown;
  id: string;
  topic_id: string;
  status: string;
  created_at: string;
}

export interface TopicCardRow {
  [key: string]: unknown;
  id: string;
  card_set_id: string;
  order: number;
  concept: string;
}

export interface TopicCardVariantRow {
  [key: string]: unknown;
  id: string;
  card_id: string;
  order: number;
  prompt: string;
  answer: string;
}

export const topicCardSetsCollection = createCollection(
  electricCollectionOptions<TopicCardSetRow>({
    id: "mobile-topic-card-sets",
    shapeOptions: {
      url: SHAPE_URL,
      params: { table: "topic_card_sets" },
      headers: { authorization: authorizationHeader },
    },
    getKey: (row) => row.id,
  }),
);

export const topicCardsCollection = createCollection(
  electricCollectionOptions<TopicCardRow>({
    id: "mobile-topic-cards",
    shapeOptions: {
      url: SHAPE_URL,
      params: { table: "topic_cards" },
      headers: { authorization: authorizationHeader },
    },
    getKey: (row) => row.id,
  }),
);

export const topicCardVariantsCollection = createCollection(
  electricCollectionOptions<TopicCardVariantRow>({
    id: "mobile-topic-card-variants",
    shapeOptions: {
      url: SHAPE_URL,
      params: { table: "topic_card_variants" },
      headers: { authorization: authorizationHeader },
    },
    getKey: (row) => row.id,
  }),
);
