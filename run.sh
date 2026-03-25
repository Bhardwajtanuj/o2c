#!/usr/bin/env bash
# run.sh — Start the full O2C Graph system locally.
# Usage: bash run.sh
# Requires: Python 3.11+, Node 18+, data/o2c.db already present (run ingest first)

set -e

echo ""
echo "══════════════════════════════════════════════"
echo "  SAP O2C Graph Intelligence — Local Setup"
echo "══════════════════════════════════════════════"
echo ""

# ── 0. Check .env exists ──────────────────────────────────────────────────────
if [ ! -f .env ]; then
  echo "⚠  No .env file found. Copying from .env.example ..."
  cp .env.example .env
  echo "   Edit .env and add your OPENROUTER_API_KEY, then re-run."
  echo ""
fi

# Load .env
export $(grep -v '^#' .env | xargs) 2>/dev/null || true

# ── 1. Ingest data if needed ──────────────────────────────────────────────────
if [ ! -f data/o2c.db ]; then
  echo "📥  Ingesting dataset into SQLite ..."
  mkdir -p data
  pip install pandas --quiet
  python ingest/ingest.py
  echo ""
else
  echo "✓   data/o2c.db already exists — skipping ingest."
fi

# Set absolute DB path to avoid working-directory issues
export DB_PATH="$(pwd)/data/o2c.db"
echo "✓   DB_PATH=$DB_PATH"

# ── 2. Install backend deps ───────────────────────────────────────────────────
echo ""
echo "📦  Installing backend dependencies ..."
 pip install -r backend/requirements.txt 
# ── 3. Install frontend deps ──────────────────────────────────────────────────
echo ""
echo "📦  Installing frontend dependencies ..."
cd frontend && npm install --silent && cd ..

# ── 4. Start backend ─────────────────────────────────────────────────────────
echo ""
echo "🚀  Starting FastAPI backend on http://localhost:8000 ..."
uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload &
BACKEND_PID=$!
echo "   Backend PID: $BACKEND_PID"

# Wait for backend to be ready
sleep 3

# ── 5. Start frontend ─────────────────────────────────────────────────────────
echo ""
echo "🌐  Starting Vite frontend on http://localhost:5173 ..."
cd frontend
VITE_API_URL=http://localhost:8000 npm run dev &
FRONTEND_PID=$!
cd ..

echo ""
echo "══════════════════════════════════════════════"
echo "  ✅  System running!"
echo "  Frontend: http://localhost:5173"
echo "  Backend:  http://localhost:8000"
echo "  API docs: http://localhost:8000/docs"
echo ""
echo "  Press Ctrl+C to stop both servers."
echo "══════════════════════════════════════════════"
echo ""

trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; echo 'Stopped.'" EXIT
wait
