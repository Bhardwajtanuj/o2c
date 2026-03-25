"""SAP O2C Graph Intelligence - FastAPI Backend"""
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
import logging

from graph import GraphDB
from llm import answer_query
from guardrails import is_in_domain

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="SAP O2C Graph API", version="1.0.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

db = GraphDB()

class QueryRequest(BaseModel):
    message: str
    history: List[Dict[str, str]] = []

class QueryResponse(BaseModel):
    answer: str
    sql_query: Optional[str] = None
    highlight_ids: List[str] = []

@app.get("/")
def root():
    return {"status": "ok", "service": "SAP O2C Graph API"}

@app.get("/api/graph")
def get_graph(group: Optional[str] = None, limit: int = 800):
    nodes = db.get_nodes(group=group, limit=limit)
    edges = db.get_edges(limit=2000)
    return {"nodes": nodes, "edges": edges}

@app.get("/api/graph/stats")
def get_stats():
    return db.get_stats()

@app.get("/api/node/{node_id:path}")
def get_node(node_id: str):
    node = db.get_node(node_id)
    if not node:
        raise HTTPException(status_code=404, detail="Node not found")
    neighbors = db.get_neighbors(node_id)
    return {"node": node, "neighbors": neighbors}

@app.post("/api/query", response_model=QueryResponse)
async def query(req: QueryRequest):
    msg = req.message.strip()
    if not msg:
        raise HTTPException(status_code=400, detail="Empty message")
    if not is_in_domain(msg):
        return QueryResponse(
            answer="This system is designed to answer questions related to the SAP Order-to-Cash dataset only.\n\nI can help with orders, deliveries, billing documents, payments, customers, and product flows.",
        )
    result = await answer_query(msg, req.history, db)
    return QueryResponse(
        answer=result["answer"],
        sql_query=result.get("sql"),
        highlight_ids=result.get("highlight_ids", [])
    )

@app.get("/api/search")
def search(q: str, limit: int = 20):
    return {"results": db.search_nodes(q, limit)}
