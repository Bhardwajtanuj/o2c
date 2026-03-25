# AI Session 01 — Schema Design & Data Exploration

**Tool:** Claude (claude.ai)
**Date:** March 2026

## Session Summary

Started by uploading the JSONL dataset zip and asking Claude to identify entity types, key fields, and join relationships. The model correctly identified the O2C chain: sales_order_headers -> outbound_delivery_items.referenceSdDocument -> billing_document_items.referenceSdDocument -> journal_entries.referenceDocument -> payments.clearingAccountingDocument.

## Key Exchange

**User:** I've uploaded the SAP O2C dataset. Can you look at the JSONL files and tell me what the graph schema should look like — nodes, edges, and how they connect?

**Claude:** [Inspected files, identified 19 entity types, proposed 7 relationship types, noted that billing_document_items.referenceSdDocument links to deliveries not orders — which was the non-obvious join]

## What Worked

- Providing sample records from each file (3 rows per entity) was enough for the model to infer all join keys
- Asking for the graph schema as a table (From, To, Join Key) rather than prose made the output immediately usable
- The model correctly identified that `billingDocumentIsCancelled` stores both boolean and string representations across different records

## What Required Iteration

- First schema draft used "Invoice" as the node label (SAP terminology) — corrected to "BillingDocument" to match the table name
- The payment-to-journal link (payments.accountingDocument = journal_entries.clearingAccountingDocument) was initially missed; required a follow-up prompt: "How does a payment link back to a journal entry?"
