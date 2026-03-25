/**
 * Context-aware intent + query builder for chat + graph.
 */

export type BuiltQuery =
  | { action: 'TRACE'; id: string; type: string | null }
  | { action: 'TOP_PRODUCTS' }
  | { action: 'FIND_ANOMALIES' }
  | {
      action: 'ANALYZE_FLOW';
      nodeId: string;
      connectedCount: number;
      groupBreakdown: Record<string, number>;
    };

export type ProcessResult =
  | { type: 'graph'; query: BuiltQuery }
  | { type: 'hint'; message: string }
  | { type: 'llm' };

/** Pass-through from GraphVisualization.getGraphContext() + derived lists */
export type GraphQueryContext = {
  selectedNode: { id: string; label?: string; displayId?: string; group?: string } | null;
  highlightedCount: number;
  /** Highlighted graph nodes (for group breakdown) */
  highlightNodes: Array<{ id: string; group: string }>;
};

export type BuildQueryResult = BuiltQuery | { error: true; message: string } | null;

const SELECT_NODE_HINT =
  "Select a node first, then try: **Analyze this flow** or **Explain this**.";

/** Matches dataset-wide overview when user is not using graph context */
export function isO2cFlowOverviewQuestion(input: string): boolean {
  const t = input.trim().toLowerCase().normalize('NFKC');
  if (/\d{6,}/.test(t)) return false;
  const phrases = [
    'analyze this flow',
    'analyze the flow',
    'analyze flow',
    'explain this flow',
    'explain the flow',
  ];
  if (phrases.some((p) => t.includes(p))) return true;
  const flowish = /\b(flow|o2c|order[\s-]to[\s-]cash)\b/.test(t);
  const verb = /\b(analyze|analyse|explain|summarize|summarise|describe|understand)\b/.test(t);
  return flowish && verb;
}

export const O2C_FLOW_OVERVIEW_CANNED =
  'Summarize the order-to-cash (O2C) flow with counts: orders, deliveries, billings, journals, payments.';

export function getIntent(raw: string): string {
  const q = raw.toLowerCase().normalize('NFKC');

  if (
    q.includes('anomaly') ||
    q.includes('anomalies') ||
    q.includes('broken') ||
    q.includes('incomplete') ||
    q.includes('gap') ||
    /\bissue?s?\b/.test(q)
  ) {
    return 'ANOMALY';
  }

  if (q.includes('most') || q.includes('top') || q.includes('highest') || q.includes('largest')) {
    return 'AGGREGATION';
  }

  if (
    q.includes('trace') ||
    q.includes('follow') ||
    (q.includes('flow') && /\d{5,}/.test(q)) ||
    (q.includes('show') && /\d/.test(q))
  ) {
    return 'TRACE';
  }

  if (/\d{5,}/.test(q)) {
    return 'TRACE';
  }

  // ANALYZE: analyze / explain / “flow” as a word (not substring-only in “workflow”)
  if (
    q.includes('analyze') ||
    q.includes('analyse') ||
    q.includes('explain') ||
    q.includes('tell me about') ||
    /\bflow\b/.test(q) ||
    q.includes("what's happening here") ||
    q.includes('whats happening here') ||
    q.includes('summarize this graph') ||
    q.includes('summarize the graph') ||
    (q === 'analyze' || q === 'explain')
  ) {
    return 'ANALYZE';
  }

  return 'UNKNOWN';
}

export function extractEntities(query: string): { id: string | null; type: string | null } {
  const q = query.toLowerCase();
  const ids = query.match(/\d+/g);
  const id = ids?.length ? ids.sort((a, b) => b.length - a.length)[0] ?? null : null;

  let type: string | null = null;
  if (q.includes('billing') || q.includes('invoice')) type = 'billing';
  else if (q.includes('payment')) type = 'payment';
  else if (q.includes('delivery') || q.includes('shipment')) type = 'delivery';
  else if (q.includes('journal')) type = 'journal';
  else if (q.includes('customer')) type = 'customer';
  else if (q.includes('order') || q.includes('sales')) type = 'order';

  return { id, type };
}

function countHighlightGroups(nodes: Array<{ group: string }>): Record<string, number> {
  const m: Record<string, number> = {};
  for (const n of nodes) {
    const g = n.group || 'unknown';
    m[g] = (m[g] || 0) + 1;
  }
  return m;
}

export function buildQuery(
  intent: string,
  entities: { id: string | null; type: string | null },
  context?: GraphQueryContext
): BuildQueryResult {
  if (intent === 'ANALYZE') {
    let sel = context?.selectedNode;
    const highlightList = context?.highlightNodes ?? [];

    // 🔥 FIX 4: SMART CONTEXT RECOVERY
    // If no node is selected, but we have a trace/highlight active, 
    // treat the first highlighted node as the subject.
    if (!sel?.id && highlightList.length > 0) {
      sel = {
        id: highlightList[0].id,
        group: highlightList[0].group,
        label: highlightList[0].id.split(':')[0], // Guess label from ID prefix
        displayId: highlightList[0].id.split(':')[1],
      };
    }

    if (!sel?.id) {
      return { 
        error: true, 
        message: "Select a node (click or trace) first, then ask to **Analyze this flow**." 
      };
    }

    const connectedCount = context?.highlightedCount ?? highlightList.length;
    
    return {
      action: 'ANALYZE_FLOW',
      nodeId: sel.id,
      connectedCount: connectedCount || 1, // At least the selected node
      groupBreakdown: countHighlightGroups(highlightList.length > 0 ? highlightList : [{ group: sel.group || 'unknown' }]),
    };
  }

  if (intent === 'TRACE' && entities.id) {
    return {
      action: 'TRACE',
      id: entities.id,
      type: entities.type,
    };
  }

  if (intent === 'AGGREGATION') {
    return { action: 'TOP_PRODUCTS' };
  }

  if (intent === 'ANOMALY') {
    return { action: 'FIND_ANOMALIES' };
  }

  return null;
}

export function processQuery(input: string, context?: GraphQueryContext): ProcessResult {
  const intent = getIntent(input);
  const entities = extractEntities(input);

  if (intent === 'TRACE' && !entities.id) {
    return {
      type: 'hint',
      message:
        'Include a document ID to trace — for example: **Trace billing 91150083** or **Follow order 740542**.',
    };
  }

  const built = buildQuery(intent, entities, context);

  if (built && 'error' in built && built.error) {
    return { type: 'hint', message: built.message };
  }

  if (built && 'action' in built) {
    return { type: 'graph', query: built as BuiltQuery };
  }

  return { type: 'llm' };
}
