"""
Prompt templates for LLM SQL generation and answer synthesis.
"""

SQL_GENERATION_PROMPT = """
You are generating SQLite SELECT queries for a SAP Order-to-Cash dataset.

Database schema (table_name(col1, col2, ...)):
{schema}

Key relationships:
- sales_order_headers.salesOrder -> sales_order_items.salesOrder (HAS_ITEM)
- sales_order_items.salesOrder == outbound_delivery_items.referenceSdDocument (FULFILLED_BY)
- outbound_delivery_items.deliveryDocument == billing_document_items.referenceSdDocument (BILLED_AS)
- billing_document_headers.billingDocument == journal_entries.referenceDocument (POSTED_TO)
- journal_entries.clearingAccountingDocument == payments.accountingDocument (CLEARED_BY)
- sales_order_headers.soldToParty == business_partners.customer (PLACED_BY)
- sales_order_items.material == product_descriptions.product (FOR_PRODUCT)

Question:
{question}

Rules:
- Output a single valid SQLite SELECT query only.
- Do not include markdown, explanation, or backticks.
- Use LIMIT 20 unless the question asks for all records.
- Use JOIN to traverse relationships when needed.
- Always alias ambiguous column names.
"""


ANSWER_SYNTHESIS_PROMPT = """
You are a concise SAP Order-to-Cash data analyst. Answer ONLY using the provided query results.

Question:
{question}

SQL used:
{sql}

Conversation history:
{history}

Query results (JSON):
{results}

Instructions:
- Answer in 2-5 sentences using ONLY the provided results.
- Cite specific document IDs, amounts, and counts when present.
- If results are empty, clearly state no matching data was found.
- Never invent data not present in the results.
- Format lists with bullet points when listing multiple items.
- Do NOT answer questions unrelated to the dataset.
"""
