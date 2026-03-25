# AI Session 02 — SQL Generation Prompt Engineering

**Tool:** Claude (claude.ai)
**Date:** March 2026

## Session Summary

Iterated on the SQL generation system prompt over ~8 exchanges. Zero-shot prompting produced syntactically valid but semantically wrong queries. Adding few-shot examples resolved most issues.

## Iteration Log

### Attempt 1 — Zero-shot
**Prompt:** "Schema: [table list]. Generate SQL for: which products appear in the most billing documents?"
**Result:** Query grouped on sales_order_items.material instead of billing_document_items.material. Returned wrong counts.

### Attempt 2 — Schema with column details
Added full column lists per table.
**Result:** Correct table used, but missing JOIN to product_descriptions for names. Bare material IDs in output.

### Attempt 3 — One shot with aggregation example
Added Example 1 (top products query) to the prompt.
**Result:** Correct. Added LEFT JOIN to product_descriptions automatically.

### Attempt 4 — Gap detection (hardest case)
**Zero-shot result:** Used LEFT JOIN + IS NULL pattern — produced 0 results due to NULLs in the delivery link chain.
**After adding NOT IN example:** Correct. Returned 3 orders (740506, 740507, 740508).

## Key Lesson

For gap detection, the NOT IN subquery pattern is more reliable than LEFT JOIN + IS NULL when intermediate joins may themselves be NULL. The model needs to see this pattern as an example — it consistently chose the wrong approach zero-shot.

## Final Prompt Structure

1. Instruction block (role, output format constraint)
2. Full schema (all tables, key columns, join keys explicitly labeled)
3. Five examples in order of complexity
4. Question injection

Total prompt tokens: ~1,200 for SQL generation. Well within free-tier limits.
