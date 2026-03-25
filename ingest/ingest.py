"""
One-time ingestion script: reads all JSONL files and populates o2c.db.
Run: python3 ingest/ingest.py
Safe to re-run (uses INSERT OR REPLACE).
"""
import json, glob, sqlite3, os, pandas as pd

BASE = os.environ.get("DATA_SRC", os.path.join(os.path.dirname(__file__), "../sap-o2c-data"))
DB   = os.environ.get("DB_PATH",  os.path.join(os.path.dirname(__file__), "../data/o2c.db"))

os.makedirs(os.path.dirname(DB), exist_ok=True)

def load_folder(folder):
    rows = []
    for f in glob.glob(f"{BASE}/{folder}/*.jsonl"):
        with open(f) as fh:
            for line in fh:
                line = line.strip()
                if line:
                    rows.append(json.loads(line))
    return pd.DataFrame(rows) if rows else pd.DataFrame()

TABLES = {
    "sales_order_headers":                   "sales_order_headers",
    "sales_order_items":                     "sales_order_items",
    "sales_order_schedule_lines":            "sales_order_schedule_lines",
    "outbound_delivery_headers":             "outbound_delivery_headers",
    "outbound_delivery_items":               "outbound_delivery_items",
    "billing_document_headers":              "billing_document_headers",
    "billing_document_items":               "billing_document_items",
    "billing_document_cancellations":       "billing_document_cancellations",
    "journal_entry_items_accounts_receivable": "journal_entries",
    "payments_accounts_receivable":          "payments",
    "business_partners":                     "business_partners",
    "business_partner_addresses":            "business_partner_addresses",
    "customer_company_assignments":          "customer_company_assignments",
    "customer_sales_area_assignments":       "customer_sales_area_assignments",
    "product_descriptions":                  "product_descriptions",
    "plants":                                "plants",
}

con = sqlite3.connect(DB)
for folder, table in TABLES.items():
    df = load_folder(folder)
    if df.empty:
        print(f"  SKIP (empty): {folder}")
        continue
    for col in df.columns:
        sample = df[col].dropna().iloc[0] if not df[col].dropna().empty else None
        if isinstance(sample, dict):
            df[col] = df[col].apply(lambda x: json.dumps(x) if isinstance(x, dict) else x)
    df.to_sql(table, con, if_exists="replace", index=False)
    print(f"  {table}: {len(df)} rows")

con.close()
print(f"\nDatabase written to {DB}")
