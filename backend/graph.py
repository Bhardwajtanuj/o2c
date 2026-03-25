"""
GraphDB - SQLite-backed graph store for SAP O2C data.
All graph nodes and edges are derived from the relational tables at init time.
"""
import sqlite3, json, os
from typing import Optional, List, Dict, Any

DB_PATH = os.environ.get("DB_PATH", os.path.join(os.path.dirname(__file__), "../data/o2c.db"))

class GraphDB:
    def __init__(self):
        self.db_path = DB_PATH
        self._nodes: List[Dict] = []
        self._edges: List[Dict] = []
        self._node_index: Dict[str, Dict] = {}
        self._build_graph()

    # ─── Internal helpers ──────────────────────────────────────────────────────
    def _conn(self):
        con = sqlite3.connect(self.db_path)
        con.row_factory = sqlite3.Row
        return con

    def _q(self, sql: str, params=()):
        with self._conn() as con:
            return [dict(r) for r in con.execute(sql, params).fetchall()]

    def _add_node(self, nid: str, label: str, group: str, props: Dict):
        key = f"{label}:{nid}"
        if key not in self._node_index:
            node = {"id": key, "label": label, "displayId": nid, "group": group, "props": props}
            self._nodes.append(node)
            self._node_index[key] = node
        return key

    def _add_edge(self, src: str, tgt: str, rel: str):
        if src in self._node_index and tgt in self._node_index:
            self._edges.append({"source": src, "target": tgt, "relation": rel})

    # ─── Graph construction ────────────────────────────────────────────────────
    def _build_graph(self):
        # Sales Orders
        for r in self._q("SELECT * FROM sales_order_headers"):
            self._add_node(r["salesOrder"], "SalesOrder", "order", {
                "Order ID": r["salesOrder"], "Customer": r["soldToParty"],
                "Amount": f"Rs.{float(r['totalNetAmount'] or 0):,.2f}",
                "Currency": r["transactionCurrency"],
                "Delivery Status": r["overallDeliveryStatus"],
                "Created": (r["creationDate"] or "")[:10],
            })

        # Sales Order Items
        for r in self._q("SELECT * FROM sales_order_items"):
            nid = f"{r['salesOrder']}-{r['salesOrderItem']}"
            self._add_node(nid, "SalesOrderItem", "order_item", {
                "Order": r["salesOrder"], "Item": r["salesOrderItem"],
                "Material": r["material"], "Qty": r["requestedQuantity"],
                "Amount": f"Rs.{float(r['netAmount'] or 0):,.2f}",
            })
            self._add_edge(f"SalesOrder:{r['salesOrder']}", f"SalesOrderItem:{nid}", "HAS_ITEM")

        # Customers
        for r in self._q("SELECT * FROM business_partners"):
            cid = r["customer"] or r["businessPartner"]
            self._add_node(cid, "Customer", "customer", {
                "ID": cid, "Name": r["businessPartnerFullName"], "Blocked": str(r["businessPartnerIsBlocked"]),
            })
        for r in self._q("SELECT salesOrder, soldToParty FROM sales_order_headers"):
            self._add_edge(f"SalesOrder:{r['salesOrder']}", f"Customer:{r['soldToParty']}", "PLACED_BY")

        # Products
        for r in self._q("SELECT product, productDescription FROM product_descriptions WHERE language='EN' OR language=''"):
            self._add_node(r["product"], "Product", "product", {
                "Material": r["product"], "Description": r["productDescription"],
            })
        for r in self._q("SELECT salesOrder, salesOrderItem, material FROM sales_order_items"):
            item_key = f"SalesOrderItem:{r['salesOrder']}-{r['salesOrderItem']}"
            self._add_edge(item_key, f"Product:{r['material']}", "FOR_PRODUCT")

        # Deliveries
        for r in self._q("SELECT * FROM outbound_delivery_headers"):
            self._add_node(r["deliveryDocument"], "Delivery", "delivery", {
                "Delivery ID": r["deliveryDocument"],
                "Goods Movement": r["overallGoodsMovementStatus"],
                "Picking": r["overallPickingStatus"],
                "Shipping Point": r["shippingPoint"],
                "Created": (r["creationDate"] or "")[:10],
            })
        for r in self._q("SELECT DISTINCT deliveryDocument, referenceSdDocument FROM outbound_delivery_items"):
            self._add_edge(f"SalesOrder:{r['referenceSdDocument']}", f"Delivery:{r['deliveryDocument']}", "FULFILLED_BY")

        # Billing Documents
        for r in self._q("SELECT * FROM billing_document_headers"):
            self._add_node(r["billingDocument"], "BillingDocument", "billing", {
                "Billing ID": r["billingDocument"],
                "Amount": f"Rs.{float(r['totalNetAmount'] or 0):,.2f}",
                "Cancelled": str(bool(r["billingDocumentIsCancelled"])),
                "Accounting Doc": r["accountingDocument"],
                "Customer": r["soldToParty"],
                "Date": (r["billingDocumentDate"] or "")[:10],
            })
        for r in self._q("SELECT DISTINCT billingDocument, referenceSdDocument FROM billing_document_items"):
            self._add_edge(f"Delivery:{r['referenceSdDocument']}", f"BillingDocument:{r['billingDocument']}", "BILLED_AS")

        # Journal Entries
        for r in self._q("SELECT DISTINCT accountingDocument, referenceDocument, customer, amountInTransactionCurrency, postingDate, clearingAccountingDocument FROM journal_entries"):
            self._add_node(r["accountingDocument"], "JournalEntry", "journal", {
                "Accounting Doc": r["accountingDocument"],
                "Reference Doc": r["referenceDocument"],
                "Customer": r["customer"],
                "Amount": f"Rs.{float(r['amountInTransactionCurrency'] or 0):,.2f}",
                "Posting Date": (r["postingDate"] or "")[:10],
            })
            self._add_edge(f"BillingDocument:{r['referenceDocument']}", f"JournalEntry:{r['accountingDocument']}", "POSTED_TO")

        # Payments
        for r in self._q("SELECT DISTINCT accountingDocument, clearingAccountingDocument, customer, amountInTransactionCurrency, clearingDate FROM payments"):
            self._add_node(r["accountingDocument"], "Payment", "payment", {
                "Payment Doc": r["accountingDocument"],
                "Clearing Doc": r["clearingAccountingDocument"],
                "Customer": r["customer"],
                "Amount": f"Rs.{float(r['amountInTransactionCurrency'] or 0):,.2f}",
                "Cleared On": (r["clearingDate"] or "")[:10],
            })
            for je in self._q("SELECT accountingDocument FROM journal_entries WHERE clearingAccountingDocument=?", (r["accountingDocument"],)):
                self._add_edge(f"JournalEntry:{je['accountingDocument']}", f"Payment:{r['accountingDocument']}", "CLEARED_BY")

    # ─── Public API ────────────────────────────────────────────────────────────
    def get_nodes(self, group: Optional[str] = None, limit: int = 800) -> List[Dict]:
        nodes = self._nodes if not group else [n for n in self._nodes if n["group"] == group]
        return nodes[:limit]

    def get_edges(self, limit: int = 2000) -> List[Dict]:
        return self._edges[:limit]

    def get_node(self, node_id: str) -> Optional[Dict]:
        return self._node_index.get(node_id)

    def get_neighbors(self, node_id: str) -> List[Dict]:
        result = []
        for e in self._edges:
            if e["source"] == node_id:
                n = self._node_index.get(e["target"])
                if n: result.append({"direction": "out", "relation": e["relation"], "node": n})
            elif e["target"] == node_id:
                n = self._node_index.get(e["source"])
                if n: result.append({"direction": "in", "relation": e["relation"], "node": n})
        return result

    def get_stats(self) -> Dict:
        from collections import Counter
        gc = Counter(n["group"] for n in self._nodes)
        rc = Counter(e["relation"] for e in self._edges)
        return {"node_count": len(self._nodes), "edge_count": len(self._edges),
                "by_group": dict(gc), "by_relation": dict(rc)}

    def search_nodes(self, query: str, limit: int = 20) -> List[Dict]:
        q = query.lower()
        return [n for n in self._nodes if
                q in n["displayId"].lower() or
                q in n["label"].lower() or
                any(q in str(v).lower() for v in n["props"].values())][:limit]

    # ─── Raw SQL queries (used by LLM layer) ──────────────────────────────────
    def run_sql(self, sql: str) -> List[Dict]:
        """Execute a read-only SQL query and return rows as dicts."""
        sql_lower = sql.strip().lower()
        # Safety: only SELECT allowed
        if not sql_lower.startswith("select"):
            raise ValueError("Only SELECT queries are permitted.")
        forbidden = ["drop", "delete", "insert", "update", "alter", "create", "attach"]
        for word in forbidden:
            if f" {word} " in f" {sql_lower} ":
                raise ValueError(f"Forbidden keyword: {word}")
        return self._q(sql)

    def get_schema_summary(self) -> str:
        schema_path = os.path.join(os.path.dirname(__file__), "../data/schema.txt")
        with open(schema_path) as f:
            return f.read()
