import type { Server } from "node:http";

export interface SeedItem {
  match: string;
  item: Record<string, unknown>;
}

export interface MockLlmOptions {
  embeddingDim?: number;
  seedItems?: SeedItem[];
  generic?: boolean;
}

export function embeddingFor(text: string, dim: number): number[];
export function sampleFromSchema(schema: unknown, root?: unknown, depth?: number): unknown;
export function chatContent(body: unknown, options?: Pick<MockLlmOptions, "seedItems" | "generic">): string;
export function createMockLlmServer(options?: MockLlmOptions): Server;
