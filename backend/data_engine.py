"""
Local rule-based query engine.
Handles common queries without LLM API calls for speed + reliability.
Returns None to let the LLM path handle unknown queries.
"""
import re
import unicodedata
from typing import Any, Dict, Optional, List


def normalize_question(message: str) -> str:
    """Lowercase + Unicode normalize so smart quotes / copy-paste still match."""
    return unicodedata.normalize("NFKC", message.strip()).lower()


def is_o2c_flow_overview_question(text: str) -> bool:
    if re.search(r"\d{6,}", text):
        return False
    triggers = [
        "analyze this flow", "analyze the flow", "analyze flow",
        "explain this flow", "explain the flow", "explain flow",
        "summarize the flow", "summarize this flow",
        "what is the o2c", "what is o2c", "order-to-cash",
        "order to cash", "o2c flow", "o2c overview",
        "summarize the order-to-cash", "order-to-cash flow",
    ]
    if any(t in text for t in triggers):
        return True
    flowish = re.search(r"\b(flow|o2c|order[\s-]to[\s-]cash|order-to-cash)\b", text)
    verb = re.search(r"\b(analyze|analyse|explain|summarize|summarise|describe|understand)\b", text)
    return bool(flowish and verb)


class LocalDataEngine:
    def __init__(self, db: Any):
        self.db = db

    def run(self, message: str) -> Optional[Dict[str, Any]]:
        text = normalize_question(message)

        if self._is_list_orders_query(text):
            return self._list_orders()
        if self._is_top_billed_products_query(text):
            return self._top_billed_products()
        if self._is_broken_flows_query(text):
            return self._broken_flows()
        if self._is_undelivered_orders_query(text):
            return self._undelivered_orders()
        if self._is_unbilled_deliveries_query(text):
            return self._unbilled_deliveries()
        if self._is_unpaid_query(text):
            return self._unpaid_billings()
        if self._is_customer_orders_query(text):
            return self._customer_orders()
        if is_o2c_flow_overview_question(text):
            return self._o2c_flow_overview()

        # Trace specific document — handled by graph but also provide data answer
        trace_match = re.search(r"\b(billing|invoice|order|delivery|payment)\b.*?\b(\d{6,10})\b", text)
        if trace_match:
            return self._trace_document(trace_match.group(2), trace_match.group(1))

        return None

    # ── Overview ──────────────────────────────────────────────────────────────
    def _o2c_flow_overview(self) -> Dict[str, Any]:
        sql = (
            "SELECT "
            "(SELECT COUNT(DISTINCT salesOrder) FROM sales_order_headers) AS sales_orders, "
            "(SELECT COUNT(DISTINCT deliveryDocument) FROM outbound_delivery_headers) AS deliveries, "
            "(SELECT COUNT(DISTINCT billingDocument) FROM billing_document_headers) AS billings, "
            "(SELECT COUNT(DISTINCT accountingDocument) FROM journal_entries) AS journals, "
            "(SELECT COUNT(DISTINCT accountingDocument) FROM payments) AS payments;"
        )
        rows: List[Dict[str, Any]] = self.db.run_sql(sql)
        if not rows:
            return {"answer": "Could not load dataset overview.", "sql": sql, "highlight_ids": []}
        r = rows[0]
        answer = (
            "Here is the **Order-to-Cash (O2C)** dataset overview:\n\n"
            f"- **Sales Orders**: {r.get('sales_orders', 0)}\n"
            f"- **Deliveries**: {r.get('deliveries', 0)}\n"
            f"- **Billing Documents**: {r.get('billings', 0)}\n"
            f"- **Journal Entries**: {r.get('journals', 0)}\n"
            f"- **Payments**: {r.get('payments', 0)}\n\n"
            "Typical flow: **SalesOrder → Delivery → BillingDocument → JournalEntry → Payment**\n\n"
            "Ask something specific, e.g. **Trace billing document 91150083** or "
            "**Show sales orders without deliveries**."
        )
        return {"answer": answer, "sql": sql, "highlight_ids": []}

    # ── List orders ───────────────────────────────────────────────────────────
    def _is_list_orders_query(self, text: str) -> bool:
        return any(t in text for t in [
            "list of orders", "list orders", "show orders", "all orders",
            "give list of orders", "order list", "show all sales orders",
        ])

    def _list_orders(self) -> Dict[str, Any]:
        sql = (
            "SELECT salesOrder, soldToParty, totalNetAmount, transactionCurrency, creationDate, overallDeliveryStatus "
            "FROM sales_order_headers ORDER BY salesOrder LIMIT 50;"
        )
        rows = self.db.run_sql(sql)
        if not rows:
            return {"answer": "No sales orders found.", "sql": sql, "highlight_ids": []}
        lines = ["Here are sales orders in the dataset (up to 50):\n"]
        highlight_ids = []
        for r in rows:
            oid = str(r.get("salesOrder", ""))
            lines.append(
                f"- **{oid}** | Customer {r.get('soldToParty','')} | "
                f"{r.get('totalNetAmount',0)} {r.get('transactionCurrency','')} | "
                f"Delivery: {r.get('overallDeliveryStatus','')} | {str(r.get('creationDate',''))[:10]}"
            )
            if oid: highlight_ids.append(f"SalesOrder:{oid}")
        return {"answer": "\n".join(lines), "sql": sql, "highlight_ids": highlight_ids[:25]}

    # ── Top billed products ───────────────────────────────────────────────────
    def _is_top_billed_products_query(self, text: str) -> bool:
        return any(t in text for t in [
            "products appear in the most billing documents",
            "top billed products", "most billed products",
            "products in most billing documents",
            "highest number of billing documents",
            "most billing documents",
        ])

    def _top_billed_products(self) -> Dict[str, Any]:
        sql = (
            "SELECT bi.material AS product, "
            "COUNT(DISTINCT bi.billingDocument) AS billing_document_count, "
            "COALESCE(pd.productDescription, '') AS product_description "
            "FROM billing_document_items bi "
            "LEFT JOIN product_descriptions pd ON pd.product = bi.material "
            "  AND (pd.language = 'EN' OR pd.language = '') "
            "GROUP BY bi.material, pd.productDescription "
            "ORDER BY billing_document_count DESC LIMIT 10;"
        )
        rows = self.db.run_sql(sql)
        if not rows:
            return {"answer": "No billing-product data found.", "sql": sql, "highlight_ids": []}
        lines = ["**Top 10 products by billing document count:**\n"]
        highlight_ids = []
        for r in rows:
            pid = str(r.get("product", ""))
            desc = str(r.get("product_description", "")).strip()
            suffix = f" — {desc}" if desc else ""
            lines.append(f"- **{pid}**{suffix}: {r.get('billing_document_count', 0)} billing docs")
            if pid: highlight_ids.append(f"Product:{pid}")
        return {"answer": "\n".join(lines), "sql": sql, "highlight_ids": highlight_ids}

    # ── Broken / incomplete flows ─────────────────────────────────────────────
    def _is_broken_flows_query(self, text: str) -> bool:
        return any(t in text for t in [
            "broken", "incomplete flow", "incomplete flows",
            "missing delivery", "missing billing", "missing payment",
            "delivered but not billed", "billed without delivery",
            "anomal", "identify", "gap",
        ])

    def _broken_flows(self) -> Dict[str, Any]:
        # Delivered but not billed
        sql_unb = (
            "SELECT oh.deliveryDocument, oi.referenceSdDocument AS salesOrder "
            "FROM outbound_delivery_headers oh "
            "JOIN outbound_delivery_items oi ON oi.deliveryDocument = oh.deliveryDocument "
            "WHERE NOT EXISTS ("
            "  SELECT 1 FROM billing_document_items bi WHERE bi.referenceSdDocument = oh.deliveryDocument"
            ") LIMIT 20;"
        )
        unbilled = self.db.run_sql(sql_unb)

        # Billed but no journal entry
        sql_unj = (
            "SELECT bh.billingDocument, bh.totalNetAmount "
            "FROM billing_document_headers bh "
            "WHERE NOT EXISTS ("
            "  SELECT 1 FROM journal_entries je WHERE je.referenceDocument = bh.billingDocument"
            ") LIMIT 20;"
        )
        unjournaled = self.db.run_sql(sql_unj)

        # Orders with no delivery
        sql_und = (
            "SELECT soh.salesOrder, soh.soldToParty, soh.totalNetAmount "
            "FROM sales_order_headers soh "
            "WHERE NOT EXISTS ("
            "  SELECT 1 FROM outbound_delivery_items odi WHERE odi.referenceSdDocument = soh.salesOrder"
            ") LIMIT 20;"
        )
        undelivered = self.db.run_sql(sql_und)

        lines = ["**Incomplete/broken O2C flows detected:**\n"]
        highlight_ids = []

        lines.append(f"**1. Deliveries not yet billed** ({len(unbilled)} found):")
        for r in unbilled[:10]:
            did = str(r.get("deliveryDocument", ""))
            lines.append(f"   - Delivery {did} (Order: {r.get('salesOrder','')})")
            if did: highlight_ids.append(f"Delivery:{did}")

        lines.append(f"\n**2. Billing docs with no journal entry** ({len(unjournaled)} found):")
        for r in unjournaled[:10]:
            bid = str(r.get("billingDocument", ""))
            lines.append(f"   - Billing {bid} (Amount: {r.get('totalNetAmount','')})")
            if bid: highlight_ids.append(f"BillingDocument:{bid}")

        lines.append(f"\n**3. Orders with no delivery** ({len(undelivered)} found):")
        for r in undelivered[:10]:
            oid = str(r.get("salesOrder", ""))
            lines.append(f"   - Order {oid} (Customer: {r.get('soldToParty','')}, Amount: {r.get('totalNetAmount','')})")
            if oid: highlight_ids.append(f"SalesOrder:{oid}")

        sql_combined = f"{sql_unb}\n-- AND --\n{sql_unj}\n-- AND --\n{sql_und}"
        return {"answer": "\n".join(lines), "sql": sql_combined, "highlight_ids": highlight_ids[:20]}

    # ── Undelivered orders ────────────────────────────────────────────────────
    def _is_undelivered_orders_query(self, text: str) -> bool:
        return any(t in text for t in [
            "orders without deliveries", "orders without delivery",
            "undelivered orders", "no delivery",
            "sales orders that have no delivery",
        ])

    def _undelivered_orders(self) -> Dict[str, Any]:
        sql = (
            "SELECT soh.salesOrder, soh.soldToParty, soh.totalNetAmount, soh.transactionCurrency, soh.creationDate "
            "FROM sales_order_headers soh "
            "WHERE NOT EXISTS ("
            "  SELECT 1 FROM outbound_delivery_items odi WHERE odi.referenceSdDocument = soh.salesOrder"
            ") ORDER BY soh.totalNetAmount DESC LIMIT 20;"
        )
        rows = self.db.run_sql(sql)
        if not rows:
            return {"answer": "All sales orders have at least one delivery. No gaps found.", "sql": sql, "highlight_ids": []}
        lines = [f"**Sales orders with no delivery ({len(rows)} found):**\n"]
        highlight_ids = []
        for r in rows:
            oid = str(r.get("salesOrder", ""))
            lines.append(f"- **{oid}** | Customer {r.get('soldToParty','')} | {r.get('totalNetAmount','')} {r.get('transactionCurrency','')}")
            if oid: highlight_ids.append(f"SalesOrder:{oid}")
        return {"answer": "\n".join(lines), "sql": sql, "highlight_ids": highlight_ids}

    # ── Unbilled deliveries ───────────────────────────────────────────────────
    def _is_unbilled_deliveries_query(self, text: str) -> bool:
        return any(t in text for t in [
            "unbilled", "delivered but not billed", "deliveries without billing",
            "deliveries not billed", "without billing document",
        ])

    def _unbilled_deliveries(self) -> Dict[str, Any]:
        sql = (
            "SELECT DISTINCT oh.deliveryDocument, oi.referenceSdDocument AS salesOrder "
            "FROM outbound_delivery_headers oh "
            "JOIN outbound_delivery_items oi ON oi.deliveryDocument = oh.deliveryDocument "
            "WHERE NOT EXISTS ("
            "  SELECT 1 FROM billing_document_items bi WHERE bi.referenceSdDocument = oh.deliveryDocument"
            ") LIMIT 20;"
        )
        rows = self.db.run_sql(sql)
        if not rows:
            return {"answer": "All deliveries have been billed. No gaps found.", "sql": sql, "highlight_ids": []}
        lines = [f"**Deliveries not yet billed ({len(rows)} found):**\n"]
        highlight_ids = []
        for r in rows:
            did = str(r.get("deliveryDocument", ""))
            lines.append(f"- Delivery **{did}** (Sales Order: {r.get('salesOrder','')})")
            if did: highlight_ids.append(f"Delivery:{did}")
        return {"answer": "\n".join(lines), "sql": sql, "highlight_ids": highlight_ids}

    # ── Unpaid billings ───────────────────────────────────────────────────────
    def _is_unpaid_query(self, text: str) -> bool:
        return any(t in text for t in [
            "unpaid", "outstanding", "not paid", "without payment",
            "billed but not paid", "pending payment",
        ])

    def _unpaid_billings(self) -> Dict[str, Any]:
        sql = (
            "SELECT bh.billingDocument, bh.totalNetAmount, bh.transactionCurrency, bh.billingDocumentDate "
            "FROM billing_document_headers bh "
            "WHERE bh.billingDocumentIsCancelled = 0 "
            "  AND NOT EXISTS ("
            "    SELECT 1 FROM journal_entries je "
            "    WHERE je.referenceDocument = bh.billingDocument "
            "      AND je.clearingAccountingDocument IS NOT NULL "
            "      AND je.clearingAccountingDocument != ''"
            ") ORDER BY bh.totalNetAmount DESC LIMIT 20;"
        )
        rows = self.db.run_sql(sql)
        if not rows:
            return {"answer": "All billing documents appear to be cleared/paid.", "sql": sql, "highlight_ids": []}
        total = sum(float(r.get("totalNetAmount", 0) or 0) for r in rows)
        lines = [f"**Billing documents with outstanding/pending payment ({len(rows)} found):**\n"]
        highlight_ids = []
        for r in rows:
            bid = str(r.get("billingDocument", ""))
            lines.append(f"- **{bid}** | {r.get('totalNetAmount','')} {r.get('transactionCurrency','')} | Date: {str(r.get('billingDocumentDate',''))[:10]}")
            if bid: highlight_ids.append(f"BillingDocument:{bid}")
        lines.append(f"\n**Total outstanding: {total:,.2f}**")
        return {"answer": "\n".join(lines), "sql": sql, "highlight_ids": highlight_ids}

    # ── Customer orders ────────────────────────────────────────────────────────
    def _is_customer_orders_query(self, text: str) -> bool:
        return any(t in text for t in [
            "customer", "customers", "top customers", "customers with most orders",
            "which customers", "customers have the most",
        ])

    def _customer_orders(self) -> Dict[str, Any]:
        sql = (
            "SELECT soh.soldToParty AS customer, "
            "COUNT(DISTINCT soh.salesOrder) AS order_count, "
            "SUM(CAST(soh.totalNetAmount AS REAL)) AS total_amount, "
            "bp.businessPartnerFullName AS name "
            "FROM sales_order_headers soh "
            "LEFT JOIN business_partners bp ON bp.customer = soh.soldToParty "
            "GROUP BY soh.soldToParty, bp.businessPartnerFullName "
            "ORDER BY order_count DESC LIMIT 10;"
        )
        rows = self.db.run_sql(sql)
        if not rows:
            return {"answer": "No customer data found.", "sql": sql, "highlight_ids": []}
        lines = ["**Customers by order count:**\n"]
        highlight_ids = []
        for r in rows:
            cid = str(r.get("customer", ""))
            name = str(r.get("name", "") or "").strip()
            label = f"{name} ({cid})" if name else cid
            lines.append(f"- **{label}** — {r.get('order_count',0)} orders | Total: {r.get('total_amount',0):,.2f}")
            if cid: highlight_ids.append(f"Customer:{cid}")
        return {"answer": "\n".join(lines), "sql": sql, "highlight_ids": highlight_ids}

    # ── Trace specific document ────────────────────────────────────────────────
    def _trace_document(self, doc_id: str, doc_type: str) -> Optional[Dict[str, Any]]:
        """Trace the full O2C chain for a specific document ID."""
        try:
            if "billing" in doc_type or "invoice" in doc_type:
                return self._trace_billing(doc_id)
            elif "order" in doc_type:
                return self._trace_order(doc_id)
            elif "delivery" in doc_type:
                return self._trace_delivery(doc_id)
        except Exception:
            pass
        return None

    def _trace_billing(self, billing_id: str) -> Dict[str, Any]:
        sql = (
            "SELECT "
            "  bh.billingDocument, bh.totalNetAmount, bh.billingDocumentDate, bh.billingDocumentIsCancelled, "
            "  oi.referenceSdDocument AS deliveryDocument, "
            "  je.accountingDocument AS journalEntry, je.amountInTransactionCurrency, je.postingDate, "
            "  je.clearingAccountingDocument AS paymentDoc, je.clearingDate "
            "FROM billing_document_headers bh "
            "LEFT JOIN billing_document_items bi ON bi.billingDocument = bh.billingDocument "
            "LEFT JOIN outbound_delivery_items oi ON oi.deliveryDocument = bi.referenceSdDocument "
            "LEFT JOIN journal_entries je ON je.referenceDocument = bh.billingDocument "
            f"WHERE bh.billingDocument = '{billing_id}' LIMIT 5;"
        )
        rows = self.db.run_sql(sql)
        if not rows:
            return {
                "answer": f"No data found for billing document **{billing_id}**. Check the ID and try again.",
                "sql": sql, "highlight_ids": []
            }
        r = rows[0]
        highlight_ids = [f"BillingDocument:{billing_id}"]
        lines = [f"**Full O2C trace for Billing Document {billing_id}:**\n"]

        delivery = r.get("deliveryDocument")
        if delivery:
            lines.append(f"📦 **Delivery**: {delivery}")
            highlight_ids.append(f"Delivery:{delivery}")

        lines.append(f"🧾 **Billing Document**: {billing_id} | Amount: {r.get('totalNetAmount','')} | Date: {str(r.get('billingDocumentDate',''))[:10]}")
        if r.get("billingDocumentIsCancelled"):
            lines.append("   ⚠️ This billing document is **cancelled**.")

        je = r.get("journalEntry")
        if je:
            lines.append(f"📒 **Journal Entry**: {je} | Amount: {r.get('amountInTransactionCurrency','')} | Posted: {str(r.get('postingDate',''))[:10]}")
            highlight_ids.append(f"JournalEntry:{je}")
        else:
            lines.append("📒 **Journal Entry**: Not yet posted")

        pmt = r.get("paymentDoc")
        if pmt:
            lines.append(f"💳 **Payment**: {pmt} | Cleared: {str(r.get('clearingDate',''))[:10]}")
            highlight_ids.append(f"Payment:{pmt}")
        else:
            lines.append("💳 **Payment**: Not yet received")

        return {"answer": "\n".join(lines), "sql": sql, "highlight_ids": highlight_ids}

    def _trace_order(self, order_id: str) -> Dict[str, Any]:
        sql = (
            "SELECT soh.salesOrder, soh.soldToParty, soh.totalNetAmount, soh.creationDate, "
            "  odi.deliveryDocument, bh.billingDocument, bh.totalNetAmount AS billedAmount, "
            "  je.accountingDocument AS journalEntry, je.clearingAccountingDocument AS paymentDoc "
            "FROM sales_order_headers soh "
            "LEFT JOIN outbound_delivery_items odi ON odi.referenceSdDocument = soh.salesOrder "
            "LEFT JOIN billing_document_items bdi ON bdi.referenceSdDocument = odi.deliveryDocument "
            "LEFT JOIN billing_document_headers bh ON bh.billingDocument = bdi.billingDocument "
            "LEFT JOIN journal_entries je ON je.referenceDocument = bh.billingDocument "
            f"WHERE soh.salesOrder = '{order_id}' LIMIT 5;"
        )
        rows = self.db.run_sql(sql)
        if not rows:
            return {
                "answer": f"No data found for sales order **{order_id}**.",
                "sql": sql, "highlight_ids": []
            }
        r = rows[0]
        highlight_ids = [f"SalesOrder:{order_id}"]
        lines = [f"**Full O2C trace for Sales Order {order_id}:**\n"]
        lines.append(f"🛒 **Sales Order**: {order_id} | Customer: {r.get('soldToParty','')} | Amount: {r.get('totalNetAmount','')} | Created: {str(r.get('creationDate',''))[:10]}")

        delivery = r.get("deliveryDocument")
        if delivery:
            lines.append(f"📦 **Delivery**: {delivery}")
            highlight_ids.append(f"Delivery:{delivery}")
        else:
            lines.append("📦 **Delivery**: Not yet created")

        billing = r.get("billingDocument")
        if billing:
            lines.append(f"🧾 **Billing**: {billing} | Billed: {r.get('billedAmount','')}")
            highlight_ids.append(f"BillingDocument:{billing}")
        else:
            lines.append("🧾 **Billing**: Not yet billed")

        je = r.get("journalEntry")
        if je:
            lines.append(f"📒 **Journal Entry**: {je}")
            highlight_ids.append(f"JournalEntry:{je}")

        pmt = r.get("paymentDoc")
        if pmt:
            lines.append(f"💳 **Payment**: {pmt}")
        else:
            lines.append("💳 **Payment**: Not yet received")

        return {"answer": "\n".join(lines), "sql": sql, "highlight_ids": highlight_ids}

    def _trace_delivery(self, delivery_id: str) -> Dict[str, Any]:
        sql = (
            "SELECT oh.deliveryDocument, oi.referenceSdDocument AS salesOrder, "
            "  bh.billingDocument, bh.totalNetAmount, "
            "  je.accountingDocument AS journalEntry, je.clearingAccountingDocument AS paymentDoc "
            "FROM outbound_delivery_headers oh "
            "LEFT JOIN outbound_delivery_items oi ON oi.deliveryDocument = oh.deliveryDocument "
            "LEFT JOIN billing_document_items bdi ON bdi.referenceSdDocument = oh.deliveryDocument "
            "LEFT JOIN billing_document_headers bh ON bh.billingDocument = bdi.billingDocument "
            "LEFT JOIN journal_entries je ON je.referenceDocument = bh.billingDocument "
            f"WHERE oh.deliveryDocument = '{delivery_id}' LIMIT 5;"
        )
        rows = self.db.run_sql(sql)
        if not rows:
            return {"answer": f"No data found for delivery **{delivery_id}**.", "sql": sql, "highlight_ids": []}
        r = rows[0]
        highlight_ids = [f"Delivery:{delivery_id}"]
        lines = [f"**Full O2C trace for Delivery {delivery_id}:**\n"]
        so = r.get("salesOrder")
        if so:
            lines.append(f"🛒 **Sales Order**: {so}")
            highlight_ids.append(f"SalesOrder:{so}")
        lines.append(f"📦 **Delivery**: {delivery_id}")
        billing = r.get("billingDocument")
        if billing:
            lines.append(f"🧾 **Billing**: {billing} | Amount: {r.get('totalNetAmount','')}")
            highlight_ids.append(f"BillingDocument:{billing}")
        else:
            lines.append("🧾 **Billing**: Not yet billed")
        je = r.get("journalEntry")
        if je:
            lines.append(f"📒 **Journal Entry**: {je}")
            highlight_ids.append(f"JournalEntry:{je}")
        pmt = r.get("paymentDoc")
        if pmt:
            lines.append(f"💳 **Payment**: {pmt}")
        else:
            lines.append("💳 **Payment**: Not yet received")
        return {"answer": "\n".join(lines), "sql": sql, "highlight_ids": highlight_ids}
