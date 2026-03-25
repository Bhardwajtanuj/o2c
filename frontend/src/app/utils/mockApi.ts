// API client for FastAPI backend

export interface GraphNode {
  id: string;
  label: string;
  displayId: string;
  group: string;
  props?: Record<string, any>;
}

export interface GraphEdge {
  source: string;
  target: string;
  relation: string;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface GraphStats {
  node_count: number;
  edge_count: number;
  by_group: Record<string, number>;
  by_relation: Record<string, number>;
}

export interface QueryResponse {
  answer: string;
  sql_query?: string;
  highlight_ids?: string[];
  chart?: string;
  products?: string[];
}

// Generate mock graph data
export function generateMockGraphData(groups: string[], limit: number): GraphData {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  
  const groupSizes: Record<string, number> = {
    order: 100,
    delivery: 86,
    billing: 163,
    journal: 123,
    payment: 120,
    customer: 8
  };

  let nodeId = 0;
  const nodesByGroup: Record<string, string[]> = {};

  // Create nodes for selected groups
  groups.forEach(group => {
    const size = Math.min(groupSizes[group] || 10, Math.floor(limit / groups.length));
    nodesByGroup[group] = [];
    
    for (let i = 0; i < size; i++) {
      const id = `${group}:${nodeId}`;
      nodes.push({
        id,
        label: group.charAt(0).toUpperCase() + group.slice(1),
        displayId: String(740000 + nodeId),
        group,
        props: { Created: '2025-03-31' }
      });
      nodesByGroup[group].push(id);
      nodeId++;
    }
  });

  // Create edges between nodes
  const relations = ['FULFILLED_BY', 'BILLED_BY', 'POSTED_TO', 'PAID_BY', 'BELONGS_TO'];
  
  nodes.forEach((node, idx) => {
    // Create some random connections
    const numConnections = Math.floor(Math.random() * 3) + 1;
    for (let i = 0; i < numConnections; i++) {
      const targetIdx = Math.floor(Math.random() * nodes.length);
      if (targetIdx !== idx && nodes[targetIdx]) {
        edges.push({
          source: node.id,
          target: nodes[targetIdx].id,
          relation: relations[Math.floor(Math.random() * relations.length)]
        });
      }
    }
  });

  return { nodes, edges };
}

export function getMockStats(): GraphStats {
  return {
    node_count: 600,
    edge_count: 1200,
    by_group: {
      order: 100,
      delivery: 86,
      billing: 163,
      journal: 123,
      payment: 120,
      customer: 8
    },
    by_relation: {
      FULFILLED_BY: 86,
      BILLED_BY: 163,
      POSTED_TO: 123,
      PAID_BY: 120,
      BELONGS_TO: 100
    }
  };
}

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export async function fetchGraphData(groups: string[], limit: number): Promise<GraphData> {
  const params = new URLSearchParams({ limit: String(limit) });
  const responses = await Promise.all(
    groups.map((group) =>
      fetch(`${API_BASE}/api/graph?group=${encodeURIComponent(group)}&${params.toString()}`)
    )
  );
  const payloads = await Promise.all(responses.map((r) => r.json()));
  const nodeMap = new Map<string, GraphNode>();
  const edgeMap = new Map<string, GraphEdge>();

  for (const payload of payloads) {
    for (const node of payload.nodes || []) {
      nodeMap.set(node.id, node);
    }
    for (const edge of payload.edges || []) {
      const key = `${edge.source}|${edge.target}|${edge.relation}`;
      edgeMap.set(key, edge);
    }
  }

  return { nodes: Array.from(nodeMap.values()), edges: Array.from(edgeMap.values()) };
}

export async function fetchStats(): Promise<GraphStats> {
  const resp = await fetch(`${API_BASE}/api/graph/stats`);
  if (!resp.ok) {
    throw new Error('Failed to load graph stats');
  }
  return resp.json();
}

export async function queryAPI(
  message: string,
  history: Array<{ role: 'user' | 'assistant'; content: string }>
): Promise<QueryResponse> {
  const resp = await fetch(`${API_BASE}/api/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, history }),
  });
  if (!resp.ok) {
    throw new Error(`Query failed with status ${resp.status}`);
  }
  return resp.json();
}
