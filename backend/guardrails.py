"""
Guardrails: two-layer domain filter.
Layer 1: Fast keyword/regex pre-filter (no API call).
Layer 2: Short-message fallback — only allow if no off-topic signal.
"""
import re

DOMAIN_KEYWORDS = [
    "order", "delivery", "billing", "invoice", "payment", "journal",
    "customer", "material", "product", "sales", "dispatch", "shipment",
    "plant", "cancel", "trace", "flow", "revenue", "amount", "quantity",
    "document", "sap", "o2c", "cash", "fulfilled", "cleared", "posted",
    "incomplete", "status", "account", "fiscal", "billed", "unbilled",
    "pending", "goods", "movement", "740", "804", "905", "906", "910",
    "911", "320000", "310000", "9400", "broken", "outstanding", "unpaid",
    "undelivered", "overview", "analyze", "analyse", "explain", "summarize",
    "list", "show", "find", "which", "how many", "top", "highest", "lowest",
]

OFF_TOPIC_PATTERNS = [
    r"\bwrite\b.*(poem|story|song|essay|novel|haiku|joke|rap|lyrics)",
    r"\b(poem|haiku|sonnet|limerick)\b",
    r"capital of \w+",
    r"(weather|forecast|temperature) (in|for|at)",
    r"translate (this|to|from)",
    r"(meaning|definition) of life",
    r"tell (me )?a joke",
    r"(president|prime minister|ceo|chancellor) of \w+",
    r"\b(algebra|calculus|trigonometry)\b",
    r"recipe for \w+",
    r"who (invented|discovered|created) \w+",
    r"what is (the )?(capital|population|currency) of",
    r"(movie|film|show|series|book|novel) (review|recommendation|plot)",
    r"(play|compose|sing|draw|paint) (me |for me )?",
    r"general knowledge",
    r"(history|geography|science|math) (question|help|problem)",
    r"\b(convert|exchange rate|currency)\b(?!.*order|.*payment)",
]

# Short generic phrases that should be allowed even without domain keywords
GENERIC_ALLOW_PHRASES = [
    r"^(hi+|hello|hey)\b",   # greeting → let data engine handle it
    r"^help$",
    r"^(yes|no|ok|okay|sure|thanks|thank you)$",
]


def is_in_domain(msg: str) -> bool:
    """Return True if the message is related to the O2C domain."""
    m = msg.lower().strip()

    # Layer 1a: explicit off-topic rejection — check BEFORE anything else
    for pattern in OFF_TOPIC_PATTERNS:
        if re.search(pattern, m):
            return False

    # Layer 1b: domain keyword presence
    if any(kw in m for kw in DOMAIN_KEYWORDS):
        return True

    # Layer 1c: numeric IDs typical in O2C (6-10 digit numbers)
    if re.search(r"\b\d{6,10}\b", m):
        return True

    # Layer 1d: very short generic greetings — allow so backend can respond gracefully
    for pattern in GENERIC_ALLOW_PHRASES:
        if re.search(pattern, m):
            return True

    # Layer 1e: 1-3 word messages without off-topic signal — allow (user might just be typing a doc ID)
    if len(m.split()) <= 3:
        return True

    # Default: reject anything without domain signal
    return False
