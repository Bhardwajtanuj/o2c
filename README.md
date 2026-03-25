# SAP Order-to-Cash (O2C) Graph Intelligence System

A graph-based data exploration and natural language query system built on the SAP O2C dataset. Converts fragmented JSONL business data into a queryable knowledge graph with interactive visualization and an LLM-powered chat interface.

---

## Live Demo

| Service  | URL |
|----------|-----|
| Frontend | Deploy on Vercel (free) — see Deployment section |
| Backend  | Deploy on Render (free) — see Deployment section |
| API Docs | `https://<your-render-app>.onrender.com/docs` |

---

## Quick Start (Local)

```bash
# 1. Clone the repo and enter the project
cd o2c

# 2. Add your OpenRouter API key (free at https://openrouter.ai)
cp .env.example .env
# Edit .env → set OPENROUTER_API_KEY=sk-or-...

# 3. Run everything (installs deps, starts backend + frontend)
bash run.sh
```

- **Frontend**: http://localhost:5173
- **Backend API**: http://localhost:8000
- **Swagger docs**: http://localhost:8000/docs

> **Note**: `data/o2c.db` is included. If you have the original JSONL files, re-ingest with:
> `python ingest/ingest.py`

---

## Architecture

```
Browser (Vite + React)
  GraphView (react-force-graph-2d)  +  ChatPanel  +  SuggestedQueries
       |                                    |
       +──────────── REST API ──────────────+
                          |
                FastAPI Backend (Python)
                          |
         POST /api/query pipeline:
           1. guardrails.is_in_domain()     → reject off-topic
           2. LocalDataEngine.run()          → instant rule-based answer (no LLM)
           3. LLM SQL generation             → NL → SQLite SELECT
           4. db.run_sql()                   → execute on SQLite
           5. LLM answer synthesis           → results → natural language
           6. _extract_highlight_ids()       → highlight graph nodes
                          |
                   SQLite (data/o2c.db)
                          |
             OpenRouter API (free tier)
             model: google/gemini-flash-1.5-8b
```

---

## Graph Model

### Node Types (836 total)

| Label | Count | Key Field |
|---|---|---|
| SalesOrder | 100 | salesOrder |
| SalesOrderItem | 167 | salesOrder-salesOrderItem |
| Delivery | 86 | deliveryDocument |
| BillingDocument | 163 | billingDocument |
| JournalEntry | 123 | accountingDocument |
| Payment | 120 | accountingDocument |
| Customer | 8 | businessPartner |
| Product | 69 | product |

### Relationship Types (906 total)

| Relationship | Direction | Join Logic |
|---|---|---|
| PLACED_BY | SalesOrder → Customer | soldToParty |
| HAS_ITEM | SalesOrder → SalesOrderItem | salesOrder |
| FOR_PRODUCT | SalesOrderItem → Product | material |
| FULFILLED_BY | SalesOrder → Delivery | outbound_delivery_items.referenceSdDocument |
| BILLED_AS | Delivery → BillingDocument | billing_document_items.referenceSdDocument |
| POSTED_TO | BillingDocument → JournalEntry | journal_entries.referenceDocument |
| CLEARED_BY | JournalEntry → Payment | payments.accountingDocument |

---

## Example Queries

The system handles these natively (no LLM API call needed):

| Query | Type |
|---|---|
| `List orders` | All sales orders with status |
| `Which products appear in the most billing documents?` | Top-10 by billing count |
| `Show broken or incomplete flows` | 3 gap types detected |
| `Show deliveries without billing documents` | Unbilled deliveries |
| `Show unpaid billing documents` | Outstanding AR |
| `Show sales orders without deliveries` | Undelivered orders |
| `Which customers have the most orders?` | Customer ranking |
| `Trace billing document 91150083` | Full O2C chain trace |
| `Trace order 740506` | Order → Delivery → Billing → JE → Payment |
| `Give me an overview of the order-to-cash flow` | Dataset summary |

For other questions, the LLM generates SQL dynamically using the full schema context.

---

## Guardrails

Off-topic requests are blocked before reaching the LLM:

```
User: "Write me a poem"
→ "This system is designed to answer questions related to the SAP Order-to-Cash dataset only."

User: "What is the capital of France"
→ Same rejection

User: "Trace billing document 91150083"
→ Full O2C chain answer ✓
```

Guardrail layers:
1. **Regex patterns**: poems, stories, jokes, geography, math, etc.
2. **Domain keyword check**: O2C terminology must be present for longer messages
3. **Numeric ID detection**: 6-10 digit numbers always allowed (document IDs)

---

## Deployment

### Backend → Render.com (free)

1. Push repo to GitHub
2. New Web Service on Render → connect repo
3. **Build command**: `pip install -r backend/requirements.txt`
4. **Start command**: `uvicorn backend.main:app --host 0.0.0.0 --port $PORT`
5. **Root directory**: `o2c`
6. **Environment variables**:
   - `OPENROUTER_API_KEY` = your key
   - `DB_PATH` = `./data/o2c.db`
   - `LLM_MODEL` = `google/gemini-flash-1.5-8b`

### Frontend → Vercel (free)

1. New Project on Vercel → import repo
2. **Framework**: Vite
3. **Root directory**: `o2c/frontend`
4. **Build command**: `npm run build`
5. **Output directory**: `dist`
6. **Environment variable**: `VITE_API_URL` = `https://your-render-app.onrender.com`

---

## LLM Prompting Strategy

**SQL Generation** (`prompts.py → SQL_GENERATION_PROMPT`):
- Full schema injected (all 16 tables + columns)
- Key join relationships listed explicitly
- Strict instruction: output only SELECT, no markdown

**Answer Synthesis** (`prompts.py → ANSWER_SYNTHESIS_PROMPT`):
- Results JSON passed directly
- Instruction to use ONLY provided data (no hallucination)
- Last 6 messages of conversation history included

**Two-step pipeline** reduces LLM calls: the `LocalDataEngine` handles ~10 common query patterns instantly without any API call.

---

## Database Choice

**SQLite** — chosen because:
- Zero infrastructure (single file, bundled with the app)
- The dataset is ~1,000 rows, well within SQLite limits
- Full SQL expressiveness for complex JOINs and aggregations
- The graph is built in-memory from SQLite at startup (fast, no separate graph DB needed)

The in-memory graph (`GraphDB`) is built once on startup from SQLite and kept in RAM for O(1) node lookups and neighbor traversal.

---

## Project Structure

```
o2c/
├── backend/
│   ├── main.py          # FastAPI app, all endpoints
│   ├── graph.py         # In-memory graph + SQLite wrapper (GraphDB)
│   ├── llm.py           # LLM pipeline: SQL gen → execute → synthesis
│   ├── data_engine.py   # Local rule-based query engine (no LLM)
│   ├── guardrails.py    # Domain filter
│   ├── prompts.py       # Prompt templates
│   └── requirements.txt
├── frontend/
│   └── src/app/
│       ├── App.tsx                     # Main layout, state, query routing
│       ├── components/
│       │   ├── GraphVisualization.tsx  # Force-graph with trace/highlight
│       │   ├── ChatPanel.tsx           # Chat UI
│       │   ├── SuggestedQueries.tsx    # Quick-access query buttons
│       │   ├── MetricCard.tsx          # Stats header cards
│       │   └── Sidebar.tsx
│       └── utils/
│           ├── mockApi.ts     # REST client for backend
│           └── queryIntent.ts # Client-side query routing
├── data/
│   ├── o2c.db       # SQLite database (pre-ingested)
│   └── schema.txt   # Table schema for LLM context
├── ingest/
│   └── ingest.py    # JSONL → SQLite ingestion script
├── ai-sessions/     # AI coding session logs
├── .env.example
├── run.sh           # One-command local startup
└── README.md
```
