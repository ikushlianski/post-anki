import { EMBEDDING_DIMENSIONS } from "./schema.js";

export function padEmbedding(values: number[]): number[] {
  return [...values, ...new Array<number>(EMBEDDING_DIMENSIONS - values.length).fill(0)];
}
