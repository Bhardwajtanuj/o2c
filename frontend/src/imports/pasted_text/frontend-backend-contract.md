## Frontend Requirements to Perfectly Match Backend

### 1) Environment and Base URL
- Set `NEXT_PUBLIC_API_URL` to backend origin (no trailing `/api`), e.g.:
  - `http://127.0.0.1:8000`
- Frontend should build API base as:
  - ``${NEXT_PUBLIC_API_URL}/api``

---

### 2) Required Backend Endpoints Used by UI
- `GET /api/graph?groups=<csv>&limit=<int>`
- `GET /api/graph/stats` (primary stats source)
- `POST /api/query`
- Optional but useful:
  - `GET /api/node/{node_id}`
  - `GET /api/search?q=<text>&limit=<int>`
  - `GET /api/stats` (if you expose normalized KPI shape)

---

### 3) Exact Response Shapes Frontend Expects

#### `GET /api/graph`
```json
{
  "nodes": [
    {
      "id": "SalesOrder:740542",
      "label": "SalesOrder",
      "displayId": "740542",
      "group": "order",
      "props": { "Created": "2025-03-31" }
    }
  ],
  "edges": [
    {
      "source": "SalesOrder:740542",
      "target": "Delivery:80700012",
      "relation": "FULFILLED_BY"
    }
  ]
}
```

#### `GET /api/graph/stats`
```json
{
  "node_count": 600,
  "edge_count": 1200,
  "by_group": {
    "order": 100,
    "delivery": 86,
    "billing": 163,
    "journal": 123,
    "payment": 120,
    "customer": 8
  },
  "by_relation": {
    "FULFILLED_BY": 86
  }
}
```

#### `POST /api/query` request
```json
{
  "message": "Which products appear in the most billing documents?",
  "history": [
    { "role": "user", "content": "..." },
    { "role": "assistant", "content": "..." }
  ]
}
```

#### `POST /api/query` response
```json
{
  "answer": "Products appearing in the most billing documents...",
  "sql_query": "SELECT ...",
  "highlight_ids": ["Product:S8907367008620"]
}
```

---

### 4) Critical Contract Rules (to avoid runtime failures)
- Every edge `source` and `target` must correspond to an existing node `id` in the same payload.
- Node IDs should be stable and prefixed by entity type:
  - `SalesOrder:...`, `Delivery:...`, `BillingDocument:...`, etc.
- `highlight_ids` returned from query should use same node ID format.
- `history` roles must be only `user` or `assistant`.
- `POST /api/query` should always return JSON (even on guarded/fallback responses).

---

### 5) Frontend Feature-to-Backend Mapping
- **Graph render + filters + limit slider** → `GET /api/graph`
- **KPI cards** → `GET /api/graph/stats` (`by_group`, `node_count`, `edge_count`)
- **Chat panel** → `POST /api/query`
- **Node highlighting from answers** → `highlight_ids`
- **Suggested query buttons** → send plain text to `POST /api/query`

---

### 6) Error Handling Requirements
- Backend should return:
  - `400` with `{ "detail": "..." }` for invalid requests
  - `200` with user-friendly `answer` for domain-guarded queries
  - `500` only for true server faults
- Frontend should gracefully handle:
  - non-OK responses
  - malformed JSON
  - empty `answer`

---

### 7) CORS / Networking
- Enable CORS for frontend origin (`http://localhost:3000`, etc.) or `*` in local dev.
- Backend must be reachable from browser (no localhost mismatch from container without mapping).

---

### 8) Required Frontend Dependencies (current UI)
- `next`, `react`, `react-dom`
- `react-force-graph-2d`
- `framer-motion`
- TypeScript types if using TS

---

### 9) Data Requirements in SQLite
Must contain the tables used by query logic:
- `sales_order_headers`, `sales_order_items`
- `outbound_delivery_headers`, `outbound_delivery_items`
- `billing_document_headers`, `billing_document_items`
- `journal_entries`, `payments`
- `business_partners`, `product_descriptions`

---

If you want, I can generate this as a **`FRONTEND_BACKEND_CONTRACT.md`** file in your repo so your team can keep it as the single source of truth.