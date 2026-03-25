"""
LLM integration layer.
Two-step pipeline:
  1. NL -> SQL (query generation with full schema context)
  2. SQL results -> Natural language answer (synthesis)

Uses OpenRouter (free tier) as the LLM provider.
Falls back to the local data engine if the API is unavailable.
"""
import os, json, re, logging
import httpx
from typing import Dict, Any, List

from prompts import SQL_GENERATION_PROMPT, ANSWER_SYNTHESIS_PROMPT
from data_engine import LocalDataEngine, normalize_question, is_o2c_flow_overview_question

logger = logging.getLogger(__name__)

OPENROUTER_API_KEY = os.environ.get("OPENROUTER_API_KEY", "")
OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"
MODEL = os.environ.get("LLM_MODEL", "google/gemini-flash-1.5-8b")   # free tier


async def _call_llm(system: str, user: str, max_tokens: int = 800) -> str:
    """Call OpenRouter. Returns the text content of the response."""
    if not OPENROUTER_API_KEY:
        raise RuntimeError("OPENROUTER_API_KEY not set")

    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            OPENROUTER_URL,
            headers={
                "Authorization": f"Bearer {OPENROUTER_API_KEY}",
                "Content-Type": "application/json",
                "HTTP-Referer": "https://o2c-graph.vercel.app",
            },
            json={
                "model": MODEL,
                "max_tokens": max_tokens,
                "messages": [
                    {"role": "system", "content": system},
                    {"role": "user",   "content": user},
                ],
            }
        )
        resp.raise_for_status()
        data = resp.json()
        return data["choices"][0]["message"]["content"].strip()


def _clean_sql(raw: str) -> str:
    """Strip markdown fences and whitespace from LLM SQL output."""
    raw = re.sub(r"```sql\s*", "", raw, flags=re.IGNORECASE)
    raw = re.sub(r"```\s*", "", raw)
    # Remove any trailing explanation after semicolon
    raw = raw.strip()
    if ";" in raw:
        raw = raw[:raw.index(";") + 1]
    return raw.strip()


def _extract_highlight_ids(answer: str, results: List[Dict]) -> List[str]:
    """Pull document IDs from answer text and map to graph node IDs."""
    highlights = []
    patterns = [
        (r"\b(740\d{3})\b",   "SalesOrder"),
        (r"\b(807\d{5})\b",   "Delivery"),
        (r"\b(9[01]\d{6})\b", "BillingDocument"),
        (r"\b(9400\d{6})\b",  "JournalEntry"),
        (r"\b(3[12]0000\d{3})\b", "Customer"),
    ]
    for pat, label in patterns:
        for m in re.findall(pat, answer):
            highlights.append(f"{label}:{m}")
    # Also extract from result rows
    for row in results[:20]:
        for key, val in row.items():
            s = str(val)
            for pat, label in patterns:
                for m in re.findall(pat, s):
                    highlights.append(f"{label}:{m}")
    return list(dict.fromkeys(highlights))[:10]  # dedupe, max 10


async def answer_query(
    message: str,
    history: List[Dict[str, str]],
    db,
) -> Dict[str, Any]:
    """
    Main pipeline:
    1. Try local data engine (instant, no API call).
    2. If local engine returns None, use LLM to generate SQL.
    3. Execute SQL on the database.
    4. Use LLM to synthesise a natural language answer from results.
    """
    engine = LocalDataEngine(db)

    # ── Step 1: Local engine ──────────────────────────────────────────────────
    local = engine.run(message)
    if local:
        logger.info("Answered by local engine")
        return local

    # Vague "analyze / explain this flow" handled without LLM SQL.
    if is_o2c_flow_overview_question(normalize_question(message)):
        overview = engine._o2c_flow_overview()
        logger.info("Answered by O2C flow overview fallback")
        return overview

    # ── Step 2: LLM SQL generation ────────────────────────────────────────────
    sql = None
    results = []
    try:
        schema = db.get_schema_summary()
        raw_sql = await _call_llm(
            system="You are a precise SQL generator. Output ONLY a valid SQLite SELECT query. No markdown, no backticks, no explanations.",
            user=SQL_GENERATION_PROMPT.format(schema=schema, question=message),
            max_tokens=500,
        )
        sql = _clean_sql(raw_sql)
        logger.info(f"Generated SQL: {sql[:120]}")

        # ── Step 3: Execute SQL ───────────────────────────────────────────────
        results = db.run_sql(sql)
        logger.info(f"SQL returned {len(results)} rows")

    except Exception as e:
        logger.warning(f"SQL generation/execution failed: {e}")
        return {
            "answer": (
                "I couldn't generate a valid SQL query for that question. "
                "Try rephrasing, or use one of these examples:\n\n"
                "- **Which products appear in the most billing documents?**\n"
                "- **Trace billing document 91150083**\n"
                "- **Show sales orders without deliveries**\n"
                "- **List orders with total amount over 10000**\n"
                "- **Which customers have the most orders?**"
            ),
            "sql": str(sql),
            "highlight_ids": [],
        }

    # ── Step 4: LLM answer synthesis ─────────────────────────────────────────
    history_text = "\n".join(
        f"{m['role']}: {m['content'][:200]}" for m in history[-6:]
    )
    results_json = json.dumps(results[:50], indent=2, default=str)

    try:
        answer = await _call_llm(
            system="You are a concise SAP O2C data analyst. Answer ONLY using the provided query results. Never invent data.",
            user=ANSWER_SYNTHESIS_PROMPT.format(
                question=message,
                sql=sql,
                results=results_json,
                history=history_text,
            ),
            max_tokens=600,
        )
    except Exception as e:
        logger.warning(f"Answer synthesis failed: {e}")
        answer = f"Query returned {len(results)} rows:\n\n" + "\n".join(
            str(r) for r in results[:10]
        )

    return {
        "answer": answer,
        "sql": sql,
        "highlight_ids": _extract_highlight_ids(answer, results),
    }
