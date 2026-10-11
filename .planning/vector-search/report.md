# Vector search for post-anki: alternatives to turbopuffer (October 2026)

Labels: **Fact** = read in this repo or in a cited page; **Assumption** = reasoning, not measured; **To verify** = needs a measurement or an official page.

## 1. Business summary

- **Recommendation: no turbopuffer and no other separate vector service. Move vectors into the Postgres you already run (pgvector), and fix three real gaps first.**
- **Gap 1 (Fact):** "Ask my cards" never searches the new approved knowledge. It looks only at old topic cards and reading notes. Cards from the new extraction flow are embedded and stored, but nothing reads them by meaning.
- **Gap 2 (Fact):** every question loads every stored vector from the database into the API and ranks them there. Fine for hundreds of cards, slow in the low thousands, because of data transfer rather than maths.
- **Gap 3 (Fact):** word search uses an English-only dictionary while the pasted knowledge is Russian, so word forms are not reduced to a root ("карточка" will not find "карточки").
- **Cost:** a separate service has a floor of about $16 to $350 per month with no benefit at this size. pgvector is a free extension, supported on Neon.
- **Audit and reproducibility:** with vectors in Postgres there is one source of truth and one backup; any index can be rebuilt from stored text plus a pinned embedding model id. A second store needs its own sync and backup.

## 2. What the app does today (Facts, from code)

- Embeddings come from `apps/api/src/shared/embeddings-client.ts` via OpenRouter `/embeddings`; default model `openai/text-embedding-3-small` (`env.ts`, `EMBEDDING_MODEL`), 1536 numbers per text.
- They are stored as `jsonb` arrays plus `embedding_hash` on `subjects`, `topic_card_variants`, `facts`, `knowledge_bits`, `knowledge_bit_question_variants` (`db/schema.ts`). No pgvector, no vector index. Local image is `postgres:16-alpine`; local `pg_extension` shows only `plpgsql`.
- "Ask my cards" (`global-card-chat/global-card-chat.service.ts`) and card search (`cards/cards.controller.ts`) call `findTopMatchingCards` (`cards/cards-retrieval.orchestrator.ts`). It selects every row that has an embedding (`listEmbeddedCardVariants`, `listEmbeddedFacts`), embeds the query, and `rankBySimilarity` (`packages/core/src/cards/rank-by-similarity.ts`) computes cosine similarity against every row in JavaScript (filter 0.3, sort, top K).
- Only `topic_card_variants` and `facts` are searched. Reads of `knowledgeBits.embedding` and `knowledgeBitQuestionVariants.embedding` exist only for the hash; no similarity query reads them (grep over `apps/api/src`, tests excluded).
- Subject duplicate detection compares subject vectors pairwise in memory (`packages/core/src/subject-duplicate/find-duplicate-pairs.ts`).
- Word search: `ILIKE` (`cards/card-search.repo.ts`, `search/search.repo.ts`) and `to_tsvector('english', ...)` generated columns with GIN indexes for topics, modules, knowledge bits, notes (`db/schema.ts`, `search/*.repo.ts`, `note/note-search.repo.ts`). The MCP tool `mcp/search-knowledge-items.tool.ts` combines them.
- Row counts: the local dev database is empty now (0 sources, 0 cards, 18 subjects); the earlier backup held about 10 suggestions. No production count is available from the repo (To verify on Neon).

## 3. When does in-memory ranking stop being fine (all Assumptions until measured)

- One vector is 1536 numbers. As JSON text in `jsonb` that is about 15 to 18 KB per row. As pgvector `vector(1536)` it is 6 KB (`halfvec`: 3 KB).
- The cosine maths for 10,000 vectors is about 15 million multiply-adds, tens of milliseconds in JavaScript. The cost that hurts is fetching and JSON-parsing vectors on every question: about 50 MB at 3,000 rows and about 170 MB at 10,000 rows, from Neon over the network.
- Growth guess: each approved suggestion adds 1 to 3 cards plus a suggestion vector; a few hundred pastes a year gives low thousands; importing an Anki deck (the seed notes mention a 429-deck hierarchy) could add tens of thousands at once.
- Rule of thumb: slow from roughly 2,000 to 3,000 vectors on a remote database, unacceptable around 10,000. Measure it; do not trust it.

## 4. Options compared

Prices come from third-party trackers unless stated; the search tool could not open vendor pricing pages. Treat every price as To verify.

- **pgvector on Neon (recommended).** Exact and HNSW cosine search, SQL filters and joins with your tables, hybrid with Postgres full text in one query. Fits up to low millions of vectors. Cost: free extension; same Postgres. Burden: one `CREATE EXTENSION`; the local Docker image must change to one that ships pgvector. One `pg_dump` backs up text and vectors; re-index is deterministic from text and model id. No lock-in. Neon docs: HNSW supports `vector` up to 2,000 dimensions and `halfvec` up to 4,000 (so 1536 is fine); the newest Neon version note found was pgvector 0.7.0 (To verify the current version in Neon's extension table).
- **pgvectorscale.** DiskANN-style index and compression for pgvector, for tens of millions of vectors. Free and self-hosted; no Neon source found saying it is available there (To verify).
- **Neon lakebase_vector.** pgvector types plus 4 to 8x compression (RaBitQ); requires enabling Lakebase Search on the project. Newer, Neon specific, not priced here.
- **turbopuffer.** Managed vector and BM25 on object storage. Pays off from millions to billions of vectors or many tenants. No free tier. Launch minimum reported as $16 per month (cut from $64 in June 2026), but its own page snapshot still lists $64; Scale $256, Enterprise $4,096. A second store that must be re-fillable from Postgres. Medium lock-in.
- **Qdrant.** ANN, payload filters, hybrid. Free 1 GB cluster reported (0.5 vCPU, 1 GB RAM); paid by cluster resources, about $45 to $50 per month for 1M vectors with quantization per one estimate. Open source, snapshots; second system to run.
- **Pinecone.** Managed serverless ANN. Starter free (2 GB); Standard has a $50 per month minimum, Enterprise $500. Proprietary store, high lock-in.
- **Weaviate.** ANN plus hybrid and modules. Flex reported from about $45 per month, Premium about $400; sources disagree on a $280 Plus tier. Medium lock-in, heavier to self-host.
- **LanceDB.** Embedded columnar format with ANN and full text on files or object storage; free open source. Files are easy to version but are a second source of truth. (General knowledge; no page fetched.)
- **Turso / libSQL vectors.** SQLite with `F32_BLOB` vectors and a DiskANN index queried with `vector_top_k`; vendor says full scans stay acceptable up to about 10,000 vectors; one docs page still marks it technical preview. Would mean a second database engine.
- **Vespa.** Mature ANN plus BM25 plus ranking; very large search products; high operational burden. (General knowledge, no page fetched.)
- **Elasticsearch / OpenSearch.** ANN plus strong lexical search with Russian analyzers. OpenSearch Serverless floor reported at about $350 per month (about $175 non-redundant dev). High burden, own cluster.
- **Typesense.** Typo-tolerant search; official docs list vector and hybrid search and optional auto-embedding. Self-host free; cloud price not verified.

Maturity (October 2026): pgvector, Qdrant, Pinecone, Weaviate, turbopuffer and Elasticsearch/OpenSearch are established. Vespa and LanceDB statements are not from pages fetched in this run.

## 5. Findings

1. **Symptom:** asking "Ask my cards" about something added through the new paste-and-approve flow finds nothing, because those cards are never searched by meaning. **Module:** card retrieval and the embedding scans for knowledge bits and variants. **Mechanism:** retrieval reads only legacy card variants and facts; bits and bit variants are embedded but have no query path. **Fix:** one retrieval function that searches all embedded content kinds through the database.
2. **Symptom:** slower answers as the collection grows. **Mechanism:** every question ships all vectors to the API and ranks them there. **Fix:** rank inside Postgres with an index and return only the top results.
3. **Symptom:** Russian word forms are not found. **Mechanism:** the full-text columns use the English dictionary. **Fix:** add a Russian-aware search column (Postgres ships a `russian` text search configuration) and combine word rank and vector rank by reciprocal rank fusion as in the ParadeDB guide. A BM25 extension such as pg_search would rank better than `ts_rank`, but Russian support and Neon availability were not confirmed.

## 6. Recommended path and migration steps

Business order: first make new knowledge searchable, then fast, then Russian-aware.

1. **Measure first** (an afternoon, no schema risk): count rows with an embedding per table on the real Neon database; log bytes loaded and milliseconds per "Ask my cards" question (p50 and p95); record the embedding model id and dimension in use.
2. **Make local match production:** switch the Docker image to one that ships pgvector (for example `pgvector/pgvector:pg16`) and add `CREATE EXTENSION vector` as a generated migration, never a manual push. Take a backup before migrating, as the repo rules require.
3. **Additive columns:** add `embedding_vec vector(1536)` (or `halfvec(1536)` to halve size) and an `embedding_model` text column beside the existing `jsonb` columns on the five tables.
4. **Dual write and backfill:** change the embedding orchestrators to write both columns; backfill the new column from the existing `jsonb` arrays (no new embedding cost); store the model id so a later model change is a controlled re-index, not a silent mix of incompatible vectors.
5. **HNSW index with the cosine operator class.** Change `findTopMatchingCards` into one SQL query ordered by distance with `LIMIT topK`, and include `knowledge_bits` and `knowledge_bit_question_variants` (approved only). Check that the new top 10 equals the old in-memory top 10 on a sample before switching reads.
6. **Hybrid for Russian:** add a generated tsvector column with a Russian-aware configuration beside the English one; combine word and vector ranks in SQL.
7. **Drop the old `jsonb` vectors** after one release; keep `embedding_hash`.
8. **Revisit a separate store only past these thresholds (Assumptions):** more than about 1 to 5 million vectors; several users who each need large isolated indexes (then turbopuffer or Qdrant become reasonable); heavy keyword search with Russian analyzers and facets (then OpenSearch/Elasticsearch or Typesense); a decision to leave Postgres.

## 7. Open items for the user

- Real row counts and latency from Neon (step 1) before any schema work.
- Whether legacy topic cards still matter, or whether the new knowledge flow replaces them (decides what "Ask my cards" should search).
- Confirm in Neon's extension table that pgvector is available for your Postgres version, and whether to try `pg_search` or stay with built-in text search.

## Sources

- Neon pgvector, HNSW limits and halfvec: https://neon.com/docs/extensions/pgvector
- Neon pgvector 0.7.0 changelog: https://neon.tech/docs/changelog/2024-05-24
- Neon lakebase_vector: https://neon.com/docs/extensions/lakebase-vector
- Neon extension list: https://neon.com/docs/extensions/pg-extensions
- Neon extension explorer: https://neon.com/docs/extensions/extension-explorer
- pgvector project: https://github.com/pgvector/pgvector
- pgvector index guide (March 2026): https://www.dbi-services.com/blog/pgvector-a-guide-for-dba-part-2-indexes-update-march-2026/
- ParadeDB hybrid search guide (BM25, reciprocal rank fusion): https://paradedb.com/blog/hybrid-search-in-postgresql-the-missing-manual
- Postgres text search configurations (includes `russian`): https://www.postgresql.org/docs/current/textsearch-configuration.html
- turbopuffer launch-minimum change (July 2026): https://www.usagepricing.com/blueprint/activity/turbopuffer-2026-07-14-launch-minimum-cut
- turbopuffer pricing page: https://turbopuffer.com/pricing
- Qdrant free tier tracker: https://www.costbench.com/software/vector-databases/qdrant/free-plan/
- Pinecone vs Weaviate vs Qdrant for indie hackers: https://dev.to/devtoolpicks/pinecone-vs-weaviate-vs-qdrant-for-indie-hackers-in-2026-real-costs-honest-verdict-11do
- Pinecone pricing tracker: https://usagepricing.com/blueprint/pinecone
- Weaviate pricing tracker: https://www.costbench.com/software/vector-databases/weaviate/
- Turso native vector search: https://turso.tech/blog/turso-brings-native-vector-search-to-sqlite
- libSQL DiskANN: https://turso.tech/blog/approximate-nearest-neighbor-search-with-diskann-in-libsql
- Typesense vector search docs: https://typesense.org/docs/30.0/api/vector-search.html
- OpenSearch Serverless cost: https://aws.amazon.com/blogs/big-data/amazon-opensearch-serverless-cost-effective-search-capabilities-at-any-scale
- Low confidence: every price above is from third-party trackers captured June to August 2026 and they disagree in places.

END-OF-REPORT
