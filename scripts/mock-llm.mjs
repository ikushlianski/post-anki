// Local zero-cost LLM for LLM_MODE=mock: OpenRouter-compatible chat + embeddings on 127.0.0.1.
import { createMockLlmServer } from "./lib/mock-llm.mjs";

const PORT = Number(process.env.MOCK_LLM_PORT ?? process.env.PORT ?? 4989);
const DIM = Number(process.env.MOCK_EMBEDDING_DIM ?? 1536);

createMockLlmServer({ embeddingDim: DIM }).listen(PORT, "127.0.0.1", () =>
  console.log(`mock llm on :${PORT} (embeddings dim ${DIM})`),
);
