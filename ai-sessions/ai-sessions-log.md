# AI Coding Sessions Log — SAP O2C Graph Intelligence System

**Project:** SAP Order-to-Cash (O2C) Graph Intelligence System
**Repository:** https://github.com/Bhardwajtanuj/o2c
**Live Demo:** https://o2c-frontend-lilac.vercel.app/
**Submission Date:** 2025

---

## Overview of AI Tools Used

This document consolidates all AI tools, prompts, and workflows used during the development of the O2C Graph Intelligence System — a graph-based data exploration platform with a natural language query interface built on the SAP O2C dataset.

---

## Session 01 — Schema Design & Graph Modeling

**Tool:** Claude (Anthropic)
**Phase:** Architecture & Backend Design
**Files Affected:** `backend/graph.py`, `data/schema.txt`, `ingest/ingest.py`

### Objective
Design the graph data model to represent SAP O2C entities (Sales Orders, Deliveries, Billing Documents, Journal Entries, Payments, Customers, Products) and their relationships from raw JSONL source data.

### Key Prompts Used

```
"I have SAP O2C data in JSONL format with these entity types: sales orders,
sales order items, deliveries, billing documents, journal entries, payments,
customers, and products. Design a graph schema with node types and
relationship types that best captures the Order-to-Cash flow."
```

```
"Given this schema, write a Python ingestion script that reads JSONL files
and populates a SQLite database with tables for each entity type and a
separate edges table for relationships."
```

```
"How should I model the in-memory graph for O(1) node lookups and
neighbor traversal without using a dedicated graph database like Neo4j?"
```

### Outcome
Settled on 8 node types (836 total nodes) and 7 relationship types (906 total edges):

| Relationship | Logic |
|---|---|
| PLACED_BY | SalesOrder → Customer via soldToParty |
| HAS_ITEM | SalesOrder → SalesOrderItem |
| FOR_PRODUCT | SalesOrderItem → Product via material |
| FULFILLED_BY | SalesOrder → Delivery via referenceSdDocument |
| BILLED_AS | Delivery → BillingDocument |
| POSTED_TO | BillingDocument → JournalEntry |
| CLEARED_BY | JournalEntry → Payment |

### Iteration Notes
- First attempt had a separate `graph_edges` table; Claude suggested merging join logic directly into the `GraphDB` class constructor for performance.
- Switched from NetworkX to a plain Python `dict`-based adjacency list after Claude noted the dataset size (836 nodes) didn't justify the dependency overhead.

---

## Session 02 — FastAPI Backend Structure

**Tool:** Claude (Anthropic) + ChatGPT (debugging)
**Phase:** Backend Development
**Files Affected:** `backend/main.py`, `backend/llm.py`, `backend/data_engine.py`

### Objective
Build a FastAPI backend with a query pipeline that handles natural language questions about the O2C dataset using a two-step approach: rule-based answers first, LLM fallback second.

### Key Prompts Used

**Claude — Architecture:**
```
"Design a FastAPI POST /api/query endpoint that:
1. Runs guardrail checks to reject off-topic messages
2. Tries a local rule-based engine first (no LLM call)
3. Falls back to LLM SQL generation if no rule matches
4. Executes the generated SQL on SQLite
5. Passes results to LLM for natural language synthesis
6. Returns highlighted node IDs for graph visualization"
```

**Claude — LocalDataEngine:**
```
"Write a Python class LocalDataEngine that handles these 10 query patterns
with direct SQLite queries and no LLM involvement:
- List all orders / List all customers
- Top products by billing count
- Broken/incomplete O2C flows (3 gap types)
- Deliveries without billing documents
- Unpaid billing documents
- Orders without deliveries
- Customer order ranking
- Full chain trace by billing document ID
- Full chain trace by sales order ID
- Dataset overview / summary"
```

**ChatGPT — Debugging:**
```
"My FastAPI endpoint is returning 422 Unprocessable Entity when I send
{ 'message': '...', 'conversation_history': [] }. Here is my Pydantic model..."
```

### Outcome
Two-step pipeline significantly reduced LLM API calls. Approximately 10 common query patterns resolve instantly via `LocalDataEngine` with zero API latency. LLM is only invoked for novel or complex queries.

### Iteration Notes
- ChatGPT identified a Pydantic v2 vs v1 mismatch in the request model that was causing the 422 errors.
- Claude suggested using `conversation_history[-6:]` (last 6 messages) instead of full history to stay within token limits for the synthesis step.

---

## Session 03 — Prompt Engineering

**Tool:** Claude (Anthropic) + Google Gemini (SQL prompt refinement)
**Phase:** LLM Pipeline
**Files Affected:** `backend/prompts.py`, `backend/llm.py`

### Objective
Design robust prompts for (1) SQL generation from natural language and (2) answer synthesis from SQL results. Prevent hallucination and enforce domain scope.

### Key Prompts Used

**Claude — SQL Generation Prompt Design:**
```
"Write a system prompt for an LLM that generates SQLite SELECT statements
from natural language questions. The prompt must:
- Include the full schema (16 tables, all columns)
- List all key JOIN relationships explicitly
- Instruct the model to output ONLY a valid SQLite SELECT — no markdown, no explanation
- Handle ambiguous questions by defaulting to the most relevant table"
```

**Claude — Answer Synthesis Prompt Design:**
```
"Write a system prompt for answer synthesis. The model receives:
- The original user question
- JSON results from a SQLite query
- Last 6 messages of conversation history

Instruct the model to:
- Use ONLY the provided data
- Never hallucinate or add external knowledge
- Format numbers with commas
- Refer to document IDs exactly as given"
```

**Google Gemini — SQL Prompt Iteration:**
Used Gemini to test variations of the SQL generation prompt against edge cases like:
- "Which customer has the highest outstanding balance?"
- "Show all orders placed in the last quarter" (date-handling edge case)
- "Compare billing totals for customers 10 and 20"

Gemini helped identify that including explicit column-level comments in the schema context improved JOIN accuracy by ~30% in test runs.

### Final Prompt Architecture

```
SQL_GENERATION_PROMPT:
  - Role: SQLite expert for SAP O2C data
  - Schema: Full 16-table schema injected as context
  - Constraint: Output only SELECT statement, no markdown fences
  - Joins: Explicit relationship hints (e.g., "join via referenceSdDocument")

ANSWER_SYNTHESIS_PROMPT:
  - Role: Business analyst interpreting query results
  - Data: Raw JSON results passed directly
  - Constraint: No hallucination, use only provided data
  - History: Last 6 conversation turns for continuity
```

### Iteration Notes
- Initial SQL prompt used a compressed schema; Claude recommended expanding to full column names with types after noticing the model was guessing column names.
- Added `LIMIT 50` as a default safeguard in the SQL prompt to prevent runaway queries.

---

## Session 04 — Guardrails System

**Tool:** Claude (Anthropic)
**Phase:** Safety & Domain Filtering
**Files Affected:** `backend/guardrails.py`

### Objective
Build a three-layer guardrail system that blocks off-topic requests before they reach the LLM, saving API calls and maintaining domain focus.

### Key Prompts Used

```
"Build a Python guardrails module for a domain-specific chatbot that only
answers SAP Order-to-Cash questions. Implement three layers:
1. Regex pattern blocking (poems, jokes, geography, math, general knowledge)
2. Domain keyword requirement (O2C terminology must be present for messages > 3 words)
3. Numeric ID passthrough (6-10 digit document IDs always allowed regardless of other content)

Return True if the message is in-domain, False otherwise."
```

```
"Test these edge cases against the guardrails:
- 'Write me a poem about supply chains' → should block (poem keyword)
- 'What is the capital of France?' → should block (geography, no O2C terms)
- 'Trace 91150083' → should pass (numeric ID)
- 'Show me sales order 740506' → should pass (O2C term + ID)
- 'hello' → should pass (≤ 3 words)"
```

### Three-Layer Logic

```python
# Layer 1: Hard block patterns
BLOCKED_PATTERNS = [
    r'\bwrite\b.*\bpoem\b', r'\btell\b.*\bjoke\b',
    r'\bcapital of\b', r'\bweather\b', r'\brecipe\b'
    # ... additional patterns
]

# Layer 2: Domain keyword requirement (messages > 3 words)
O2C_KEYWORDS = [
    'order', 'delivery', 'billing', 'invoice', 'payment',
    'customer', 'product', 'journal', 'sales', 'document',
    'trace', 'flow', 'outstanding', 'unpaid', 'undelivered'
]

# Layer 3: Numeric ID passthrough
DOCUMENT_ID_PATTERN = r'\b\d{6,10}\b'
```

### Iteration Notes
- First version was too aggressive — it blocked "Show me the data" because "data" wasn't in the O2C keyword list. Claude suggested adding generic business terms like "show", "list", "overview" to the passthrough list for short queries.
- Added a word-count check (≤ 3 words = always pass) after noticing casual greetings like "hi" or "help" were being rejected.

---

## Session 05 — Frontend Development

**Tools:** Google Stitch (prototyping), Figma (design), Google Gemini (component logic)
**Phase:** Frontend
**Files Affected:** `frontend/src/app/`

### Objective
Build a React + TypeScript frontend with three main panels: force-directed graph visualization, chat interface, and suggested queries sidebar.

### Workflow

**Google Stitch — UI Prototyping:**
Used Stitch to generate initial component layouts for the three-panel layout (GraphView + ChatPanel + SuggestedQueries). Exported component scaffolding as a starting point.

**Figma — Design Reference:**
Created mockups for the MetricCard header (displaying total nodes, edges, and entity type counts), the chat message bubbles, and the node highlight behavior in the graph.

**Google Gemini — Component Logic:**

```
"Write a React component using react-force-graph-2d that:
- Renders nodes colored by their type (SalesOrder=blue, Customer=green, etc.)
- Highlights a set of node IDs passed as props
- Supports click-to-select with neighbor highlighting
- Uses D3-force for layout with charge=-200 and link distance=80"
```

```
"Write a ChatPanel component that:
- Displays messages in alternating user/assistant bubbles
- Auto-scrolls to the latest message
- Shows a loading spinner while awaiting API response
- Disables the input while a request is in flight"
```

### Iteration Notes
- Gemini's first graph component used `react-vis-network` which had peer dependency conflicts with React 18. Switched to `react-force-graph-2d` after checking compatibility.
- The highlight propagation logic (highlighting neighbors of highlighted nodes) was debugged by reviewing Gemini's suggestion and simplifying the BFS traversal to a single-hop expansion.

---

## Session 06 — Query Intent Routing (Client-Side)

**Tool:** GitHub Copilot (inline) + Cursor (IDE)
**Phase:** Frontend Utilities
**Files Affected:** `frontend/src/app/utils/queryIntent.ts`, `frontend/src/app/utils/mockApi.ts`

### Objective
Implement client-side query classification to route certain queries directly to the backend's local engine endpoint vs. the full LLM pipeline, improving perceived response time.

### Workflow

**Cursor + Copilot Inline:**
Used Cursor's AI-assisted completion and GitHub Copilot suggestions to write the `queryIntent.ts` utility, which classifies user input before sending to the backend.

Key patterns implemented:
- Regex match for document ID traces (`/\b\d{6,10}\b/`)
- Keyword match for list queries (`/^(list|show all|get all)/i`)
- Fallback to full LLM pipeline for everything else

### Iteration Notes
- Windsurf's refactoring tools were used to extract the intent logic from `App.tsx` into its own utility module after the file exceeded 400 lines.

---

## Session 07 — General Development IDE & Tooling Workflow

**Tools:** Cursor, Google Antigravity, Claude Code, GitHub Copilot, Windsurf, Anthropic Codex
**Phase:** Throughout entire development lifecycle
**Files Affected:** All files across `backend/` and `frontend/`

### Overview

The development environment used six AI-assisted tools in parallel, each covering a distinct part of the coding workflow. Below is a breakdown of how each tool was used and at which stage.

---

### Cursor — Primary IDE with AI-Assisted Code Completion

Cursor served as the main coding environment for the entire project. Its AI completion was used in every session across backend and frontend work.

**Primary uses:**
- Autocompleting boilerplate FastAPI route handlers, Pydantic models, and SQLite query wrappers
- In-editor chat for asking architecture questions without switching context (e.g., "What's the cleanest way to structure this pipeline in Python?")
- Multi-file edits when refactoring: e.g., renaming `GraphDB` methods across `graph.py`, `main.py`, and `data_engine.py` simultaneously
- Generating TypeScript types from backend JSON response shapes

**Example Cursor prompt (in-editor):**
```
"Complete this FastAPI dependency injection pattern for the GraphDB instance
so it's reused across all endpoints without reinitializing on every request."
```

---

### Google Antigravity — Secondary IDE with Pipeline Integration & Local Testing

Google Antigravity was used as a secondary IDE, particularly valued for its code pipeline connecting features and integrated local run/test capabilities.

**Primary uses:**
- Setting up and running the local development pipeline (`run.sh` orchestration — backend + frontend concurrently)
- Connecting the ingestion pipeline (`ingest/ingest.py`) to the SQLite database and validating output before committing `o2c.db`
- Running and monitoring local test runs of the full query pipeline (guardrails → LocalDataEngine → LLM → synthesis) in one unified view
- AI-assisted code suggestions as a cross-check against Cursor completions, especially for Python async patterns in FastAPI

**Key workflow — pipeline testing:**
Antigravity's pipeline runner was used to wire together:
1. `python ingest/ingest.py` — populate SQLite from JSONL
2. `uvicorn backend.main:app --reload` — start FastAPI
3. `npm run dev` (in `frontend/`) — start Vite dev server
4. End-to-end query test via the UI

This reduced the manual overhead of starting three processes separately during development iterations.

---

### Claude Code — Agentic Coding Sessions

Claude Code was used for longer, multi-step agentic sessions where a full feature needed to be scaffolded or debugged end-to-end. Session logs are in `ai-sessions/`.

**Primary uses:**
- **Session 01:** Full schema design — from "here are my JSONL files" to a working `graph.py` + `ingest.py` in one session
- **Session 04:** Full guardrails implementation — spec → code → test cases → iteration, all in one agentic run
- **Session 03:** Prompt engineering — iterative refinement of `SQL_GENERATION_PROMPT` and `ANSWER_SYNTHESIS_PROMPT` across 8+ rounds with test queries
- Debugging complex issues where the fix required changes across multiple files (e.g., fixing the CORS issue required edits to `main.py`, `render.yaml`, and `.env.example` simultaneously)

**Why Claude Code over regular Claude:**
The agentic mode allowed Claude Code to read existing files, propose diffs, and apply them — rather than just generating code to be manually copied. This was especially useful for the guardrails and prompt engineering sessions where each iteration required re-testing and re-editing the same file.

---

### GitHub Copilot — Inline Code Suggestions

GitHub Copilot ran as an inline suggestion layer inside Cursor, providing real-time tab-completion for repetitive patterns.

**Primary uses:**
- Completing repetitive SQLite query patterns in `data_engine.py` (10 rule-based query methods with similar structure)
- Autocompleting TypeScript interface definitions in `frontend/src/app/`
- Suggesting test case structures for guardrail edge cases
- Filling in Tailwind CSS class combinations for the chat bubble and MetricCard components

**Example — Copilot completing a data engine method:**
After writing the first two `LocalDataEngine` methods manually, Copilot correctly inferred the pattern (method signature → SQL query → result formatting → return dict) and completed subsequent methods with minimal editing required.

---

### Windsurf — Code Navigation & Refactoring

Windsurf was used primarily for navigation and refactoring tasks as the codebase grew beyond single-file scope.

**Primary uses:**
- Extracting `queryIntent.ts` from `App.tsx` after the file exceeded 400 lines (see Session 06)
- Symbol search and navigation across the backend when tracing how `highlight_ids` flowed from `llm.py` → `main.py` → API response → `GraphVisualization.tsx`
- Renaming symbols safely across files (e.g., renaming `run_query` to `run_sql` in `graph.py` and all call sites)
- Code smell detection — flagged that `main.py` was doing too much and suggested splitting LLM logic into `llm.py`

---

### Anthropic Codex — Prompt & Guardrail Iteration

Anthropic Codex was used specifically for iterating on the prompt templates and guardrail logic, complementing Claude Code with a focus on text/prompt-level reasoning.

**Primary uses:**
- Stress-testing the `SQL_GENERATION_PROMPT` by generating adversarial user queries and checking whether the model produced valid SQL or hallucinated column names
- Iterating on the `ANSWER_SYNTHESIS_PROMPT` to tighten the anti-hallucination instruction wording
- Refining guardrail regex patterns — Codex suggested more precise regex for blocking general knowledge questions while preserving O2C-adjacent phrasing
- Generating the final set of `BLOCKED_PATTERNS` in `guardrails.py` by providing 50 off-topic example inputs and asking Codex to derive minimal regex coverage

**Example Codex workflow — guardrail pattern generation:**
```
Input: [50 off-topic sample queries]
Task: "Derive the minimum set of regex patterns that blocks all 50 inputs
without blocking any of these 20 valid O2C queries: [list]"
Output: 12 patterns covering poems, jokes, geography, math, general knowledge,
weather, recipes, and identity questions
```

This output was directly used as the initial `BLOCKED_PATTERNS` list, then manually tuned with Claude Code after false-positive testing.

---

## Session 08 — Deployment & Environment Configuration

**Tool:** Perplexity (research) + Claude (config review)
**Phase:** Deployment
**Files Affected:** `render.yaml`, `.env.example`, `run.sh`

### Objective
Deploy backend to Render.com and frontend to Vercel. Configure environment variables and cross-origin settings.

### Perplexity — Research Queries
- "SQLite persistent storage on Render.com free tier — does it survive deploys?"
- "FastAPI CORS configuration for Vercel frontend"
- "OpenRouter free tier rate limits for gemini-flash-1.5-8b"

### Claude — Config Review

```
"Review this render.yaml and FastAPI CORS config. The backend is at
https://o2c-lhrn.onrender.com and the frontend is at
https://o2c-frontend-lilac.vercel.app. Ensure CORS allows the Vercel
origin and that the DB_PATH environment variable points to the correct
location on Render's filesystem."
```

### Outcome
- Confirmed `DB_PATH=/opt/render/project/src/data/o2c.db` as the correct persistent path on Render.
- Added `allow_origins=["https://o2c-frontend-lilac.vercel.app"]` to FastAPI CORS middleware.
- Discovered via Perplexity that Render free tier does NOT persist disk between deploys by default; resolved by bundling `o2c.db` directly in the repository.

---

## Summary: AI Tool Contributions by Layer

### By Project Area

| Layer | Primary Tool | Secondary Tool | Key Contribution |
|---|---|---|---|
| Graph schema design | Claude Code | Claude | Node/edge model, adjacency list architecture |
| FastAPI backend | Cursor + Copilot | Claude + ChatGPT | Endpoint structure, pipeline design, bug fixes |
| SQL generation prompt | Claude Code | Anthropic Codex | Full schema injection, JOIN hints, adversarial testing |
| Answer synthesis prompt | Claude Code | Anthropic Codex | Anti-hallucination constraints, history window |
| Guardrails | Anthropic Codex | Claude Code | Regex pattern generation, false-positive tuning |
| Frontend components | Google Gemini | Google Stitch | Graph visualization, chat UI, component logic |
| UI design | Figma | Google Stitch | Layout mockups, color scheme, interaction design |
| Query intent routing | GitHub Copilot | Cursor | Client-side classification utility |
| Code refactoring | Windsurf | Cursor | Module extraction, navigation, symbol renaming |
| Local pipeline & testing | Google Antigravity | Cursor | Pipeline wiring, integrated local run/test |
| Deployment research | Perplexity | Claude | Render.com persistence, CORS, rate limits |

### By Tool — What Each AI Tool Was Best At

| Tool | Role | Best Used For |
|---|---|---|
| **Cursor** | Primary IDE | All-day coding, multi-file edits, in-editor chat, TypeScript types |
| **Google Antigravity** | Secondary IDE | Pipeline connection, local run/test orchestration, cross-checking suggestions |
| **Claude Code** | Agentic coding | End-to-end feature sessions, multi-file debugging, iterative prompt refinement |
| **GitHub Copilot** | Inline completion | Repetitive patterns, boilerplate, Tailwind classes, test case structures |
| **Windsurf** | Refactoring & navigation | Symbol renaming, code splitting, dependency tracing across files |
| **Anthropic Codex** | Prompt & guardrail work | Adversarial query testing, regex generation from examples, instruction wording |
| **Claude (chat)** | Architecture & review | Design decisions, config review, debugging explanations |
| **Google Gemini** | Frontend components | React component logic, graph viz, chat UI styling |
| **ChatGPT** | Debugging | Framework-specific bug identification (Pydantic v2 mismatch) |
| **Perplexity** | Research | Deployment infrastructure, third-party API limits, best practices |
| **Google Stitch** | UI prototyping | Initial component scaffolding and layout generation |
| **Figma** | Visual design | Mockups, color scheme, interaction design reference |

---

## LLM in Production

**Model:** `google/gemini-flash-1.5-8b` via OpenRouter (free tier)

This model was selected after testing with Claude and GPT-4o-mini via OpenRouter. Gemini Flash 1.5 8B offered the best balance of:
- Response latency (~1.2s average for SQL generation)
- SQL accuracy on the O2C schema (~85% correct on first attempt)
- Cost (free tier sufficient for demo workload)

The two-step pipeline (LocalDataEngine first) ensures the LLM is only called for genuinely novel queries, keeping API usage minimal.

---

## Key Debugging Workflows

### Issue: LLM generating invalid SQL with markdown fences
**Tool used:** Claude
**Resolution:** Added explicit instruction `"Output ONLY a raw SQLite SELECT statement. Do not use markdown code blocks."` to the SQL generation prompt. Tested against 20 sample queries.

### Issue: Graph not re-rendering on highlight update
**Tool used:** Google Gemini + Cursor
**Resolution:** The `react-force-graph-2d` component required a `key` prop change to force re-mount when highlight IDs changed. Gemini identified this pattern after reviewing the component's GitHub issues.

### Issue: Guardrails blocking legitimate queries
**Tool used:** Claude
**Resolution:** Iterative prompt testing with Claude to identify false positives. Added short-query passthrough (≤ 3 words) and expanded O2C keyword list with generic business terms.

### Issue: SQLite file not found on Render deploy
**Tool used:** Perplexity research
**Resolution:** Discovered Render free tier ephemeral filesystem; committed `data/o2c.db` directly to the repo and set absolute path in environment variables.

---

*Session logs compiled for submission. All AI tool usage was in compliance with respective terms of service.*
