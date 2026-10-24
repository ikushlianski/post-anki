# Domain vocabulary: source, entry, excerpt, document, knowledge item

Three levels, in plain words:

1. **Knowledge source**: the name or category of where knowledge comes from (a book, a podcast, "my sales notes"). It holds no text itself.
2. **Knowledge source entry**: one piece of raw text that belongs to a source. An entry has a kind:
   - **excerpt**: text the user pasted.
   - **document**: a document the user uploaded.
3. **Knowledge item (KI)**: one question-and-answer card extracted from an entry (front, back, optional example). A KI also records which entry and which model produced it, or that the user wrote it by hand.

An entry moves through these states: pending, processing, items detected, failed, and **processed**. An entry becomes processed only when the user marks it as exhausted after reviewing its suggestions; it never becomes processed on its own. The user can reopen a processed entry.

## Names in the schema today (kept until a dedicated rename)

| Concept | Name today | Target name |
|---|---|---|
| Knowledge source (container) | none yet | `knowledge_sources` |
| Entry (excerpt or document) | `knowledge_sources` with `kind` `prose`, `notion` | `knowledge_source_entries` with `kind` `excerpt` or `document` |
| Knowledge item | `knowledge_bits` | `knowledge_items` |
| Link between a KI and its entry | `knowledge_bits.knowledge_source_id` | `knowledge_items.entry_id` |
| Entry processed time (null = open) | `knowledge_sources.processed_at` | `knowledge_source_entries.processed_at` |
| KI origin (`extracted` or `manual`) | `knowledge_bits.origin` | `knowledge_items.origin` |

The rename touches many files and every reference is without a foreign key, so it runs as a separate step after the new container table exists.

## Rules

- User-facing words are source, excerpt, document and knowledge item (KI). The word "entry" stays in the schema and code.
- Manual KIs (added by hand to an entry) are marked as such and never count toward a model's approval or grade statistics.
- A KI always belongs to exactly one entry; an entry belongs to at most one source (nullable until the container exists).
