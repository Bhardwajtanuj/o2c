# AI Session 03 — Guardrails Implementation

**Tool:** Claude (claude.ai)
**Date:** March 2026

## Session Summary

Designed and tested the three-layer guardrail system.

## Key Design Decision: Keyword Match vs LLM Classification

**Option A:** Send every message to the LLM with a binary "is this on-topic?" prompt.
**Option B:** Keyword matching + regex for obvious off-topic, LLM only for ambiguous cases.

Chose Option B. Sending a classification API call for every message adds ~1-2 seconds of latency and uses tokens for questions like "write a poem" that are unambiguously off-topic. The keyword set covers the O2C domain well enough that LLM classification adds little value.

## Test Cases Used

| Message | Expected | Result |
|---|---|---|
| "Which products appear in the most billing documents?" | PASS | PASS |
| "Trace billing document 91150083" | PASS | PASS |
| "Write me a poem about invoices" | REJECT | REJECT (regex: write.*poem) |
| "What is the capital of Germany?" | REJECT | REJECT (regex: capital of) |
| "What is the weather today?" | REJECT | REJECT (regex: weather) |
| "Show me order status" | PASS | PASS (keyword: order, status) |
| "Hello" | REJECT | REJECT (<4 words, no domain keyword) |
| "Tell me about SAP" | PASS | PASS (keyword: sap) |
| "What is a billing document?" | PASS | PASS (keyword: billing, document) |

## SQL Injection Test

Input: "'; DROP TABLE sales_order_headers; --"
Guardrail result: SQL generated was `SELECT '; DROP TABLE...` — caught by FORBIDDEN_SQL regex before execution. Returned: "The generated query was invalid."
