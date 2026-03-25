import React, { useRef, useEffect, useMemo, useState, useCallback, forwardRef, useImperativeHandle } from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import * as d3 from 'd3-force';

const GROUP_COLORS: Record<string, string> = {
  order: '#06b6d4',
  order_item: '#67e8f9',
  delivery: '#7dd3fc',
  billing: '#f97316',
  journal: '#ef4444',
  payment: '#a855f7',
  customer: '#eab308',
  product: '#10b981',
};

export type GraphGraphContext = {
  selectedNode: any | null;
  /** Nodes in the current trace/highlight component */
  highlightedCount: number;
  highlightIds: string[];
  /** For AI / breakdown: id + group per highlighted node */
  highlightNodes: Array<{ id: string; group: string }>;
};

export type GraphVisualizationHandle = {
  traceByIdOrDisplayId: (rawId: string, docType?: string | null) => any | null;
  highlightAnomalies: () => void;
  getGraphContext: () => GraphGraphContext;
};

type GraphVisualizationProps = {
  data: { nodes: any[]; edges: any[] };
  width: number;
  height: number;
  highlightIds?: string[];
  /** Called when user clicks "Explain Flow (AI)" — should call your `/api/query` pipeline */
  onExplainFlow?: (node: any) => void | Promise<void>;
  /** Disables the explain button while the LLM request is in flight */
  explainFlowLoading?: boolean;
  onNodeSelect?: (node: any) => void;
};

export const GraphVisualization = forwardRef<GraphVisualizationHandle, GraphVisualizationProps>(
  function GraphVisualization(
    { data, width, height, highlightIds = [], onExplainFlow, explainFlowLoading = false, onNodeSelect },
    ref
  ) {
  const fgRef = useRef<any>(null);

  const [selectedNode, setSelectedNode] = useState<any>(null);
  const [highlightNodes, setHighlightNodes] = useState<Set<any>>(new Set<any>());
  const [highlightLinks, setHighlightLinks] = useState<Set<any>>(new Set<any>());

  const getLinkEndId = (end: any) => (typeof end === 'string' ? end : end?.id);
  const isHighlighted = (node: any) => highlightNodes.has(node) || highlightIds.includes(node.id);

  // Build graph
  const graphData = useMemo(
    () => {
      const nodes = data.nodes.map((n: any) => ({
        ...n,
        color: GROUP_COLORS[n.group] || '#94a3b8',
      }));
      const baseLinks = data.edges.map((e: any) => ({
        source: e.source,
        target: e.target,
        relation: e.relation,
      }));

      // Add a thin backbone so all nodes stay visually connected.
      const seen = new Set(baseLinks.map((l: any) => `${l.source}|${l.target}`));
      const backbone: any[] = [];
      for (let i = 0; i < nodes.length - 1; i++) {
        const a = nodes[i].id;
        const b = nodes[i + 1].id;
        if (!seen.has(`${a}|${b}`) && !seen.has(`${b}|${a}`)) {
          backbone.push({ source: a, target: b, relation: 'BACKBONE' });
        }
      }

      return {
        nodes,
        links: [...baseLinks, ...backbone],
      };
    },
    [data]
  );

  const adjacency = useMemo(() => {
    const map: Record<string, any[]> = {};

    graphData.links.forEach((l: any) => {
      const s = typeof l.source === 'string' ? l.source : l.source.id;
      const t = typeof l.target === 'string' ? l.target : l.target.id;

      if (!map[s]) map[s] = [];
      if (!map[t]) map[t] = [];

      map[s].push({ node: t, link: l });
      map[t].push({ node: s, link: l });
    });

    return map;
  }, [graphData]);

  // Force layout
  useEffect(() => {
    if (!fgRef.current) return;

    const fg = fgRef.current;

    fg.d3Force('charge', d3.forceManyBody().strength(-120));
    fg.d3Force('link', d3.forceLink().id((d: any) => d.id).distance(120).strength(1));
    fg.d3Force('center', d3.forceCenter(width / 2, height / 2));
    fg.d3Force('collision', d3.forceCollide(30));

    fg.d3ReheatSimulation();
  }, [graphData, width, height]);

  const traceGraph = useCallback((startNode: any) => {
    const visitedNodes = new Set<any>();
    const visitedLinks = new Set<any>();

    const queue = [startNode.id];

    while (queue.length) {
      const currentId = queue.shift() as string | undefined;
      if (currentId == null) break;
      visitedNodes.add(currentId);

      (adjacency[currentId] || []).forEach(({ node, link }: { node: string; link: any }) => {
        if (!visitedNodes.has(node)) {
          queue.push(node);
          visitedLinks.add(link);
        }
      });
    }

    const nodeSet = new Set(graphData.nodes.filter((n: any) => visitedNodes.has(n.id)));

    setHighlightNodes(nodeSet);
    setHighlightLinks(visitedLinks);
  }, [adjacency, graphData.nodes]);

  useImperativeHandle(
    ref,
    () => ({
      getGraphContext(): GraphGraphContext {
        const ids: string[] = [];
        const nodesList: Array<{ id: string; group: string }> = [];
        highlightNodes.forEach((n: any) => {
          if (n?.id) {
            ids.push(n.id);
            nodesList.push({ id: n.id, group: String(n.group ?? '') });
          }
        });
        return {
          selectedNode: selectedNode ? { ...selectedNode } : null,
          highlightedCount: highlightNodes.size,
          highlightIds: ids,
          highlightNodes: nodesList,
        };
      },
      traceByIdOrDisplayId(rawId: string, docType: string | null = null): any | null {
        const idNorm = String(rawId).trim();
        let candidates = graphData.nodes.filter(
          (n: any) =>
            n.displayId === idNorm || n.id === idNorm || String(n.id).endsWith(':' + idNorm)
        );
        const g = docType?.toLowerCase() ?? '';
        if (g === 'billing') candidates = candidates.filter((n: any) => n.group === 'billing');
        else if (g === 'order') candidates = candidates.filter((n: any) => n.group === 'order');
        else if (g === 'payment') candidates = candidates.filter((n: any) => n.group === 'payment');
        else if (g === 'delivery') candidates = candidates.filter((n: any) => n.group === 'delivery');
        else if (g === 'journal') candidates = candidates.filter((n: any) => n.group === 'journal');
        else if (g === 'customer') candidates = candidates.filter((n: any) => n.group === 'customer');

        const node = candidates[0];
        if (!node) return null;

        setSelectedNode({ ...node });
        if (onNodeSelect) onNodeSelect({ ...node });
        traceGraph(node);
        requestAnimationFrame(() => {
          setTimeout(() => {
            if (!fgRef.current || node.x == null || node.y == null) return;
            fgRef.current.centerAt(node.x, node.y, 500);
            fgRef.current.zoom(2, 500);
          }, 80);
        });
        return { ...node };
      },
      highlightAnomalies(): void {
        const connected = new Set<string>();
        graphData.links.forEach((l: any) => {
          const s = getLinkEndId(l.source);
          const t = getLinkEndId(l.target);
          if (s) connected.add(s);
          if (t) connected.add(t);
        });
        const iso = graphData.nodes.filter((n: any) => !connected.has(n.id));
        setHighlightNodes(new Set(iso));
        setHighlightLinks(new Set());
        setSelectedNode(null);
      },
    }),
    [graphData.links, graphData.nodes, traceGraph, highlightNodes, selectedNode]
  );

  // Detect anomalies (isolated nodes)
  const anomalies = useMemo(() => {
    const connected = new Set();
    graphData.links.forEach((l: any) => {
      const sourceId = getLinkEndId(l.source);
      const targetId = getLinkEndId(l.target);
      if (sourceId) connected.add(sourceId);
      if (targetId) connected.add(targetId);
    });

    return graphData.nodes.filter((n: any) => !connected.has(n.id));
  }, [graphData]);

  // Zoom to fit
  useEffect(() => {
    if (fgRef.current) {
      setTimeout(() => fgRef.current.zoomToFit(400), 500);
    }
  }, [graphData]);

  return (
    <div className="w-full h-full relative">
      {/* AI panel */}
      {selectedNode && (
        <div className="absolute top-4 right-4 z-[999] bg-white border shadow-xl p-4 rounded-lg w-72 text-sm">
          <h3 className="font-bold mb-2">Node Details</h3>
          <p>
            <b>ID:</b> {selectedNode.id}
          </p>
          <p>
            <b>Type:</b> {selectedNode.group}
          </p>
          <p>
            <b>Label:</b> {selectedNode.label}
          </p>
          <div className="mt-2 max-h-44 overflow-auto border-t pt-2">
            {selectedNode.props && Object.keys(selectedNode.props).length > 0 ? (
              Object.entries(selectedNode.props).map(([k, v]) => (
                <p key={k} className="break-words">
                  <b>{k}:</b> {String(v ?? '-')}
                </p>
              ))
            ) : (
              <p>No additional metadata.</p>
            )}
          </div>

          <button
            type="button"
            disabled={explainFlowLoading || !onExplainFlow}
            className="mt-2 px-3 py-1 bg-blue-500 text-white rounded disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={() => {
              if (onExplainFlow) void onExplainFlow({ ...selectedNode });
            }}
          >
            {explainFlowLoading ? 'Explaining…' : 'Explain Flow (AI)'}
          </button>
        </div>
      )}

      {/* Anomaly warning */}
      {anomalies.length > 0 && (
        <div className="absolute bottom-4 left-4 bg-red-100 text-red-600 p-2 rounded text-xs z-10">
          {`⚠ ${anomalies.length} isolated nodes detected`}
        </div>
      )}

      <ForceGraph2D
        ref={fgRef}
        graphData={graphData}
        width={width}
        height={height}
        nodeLabel={(node: any) => `${node.label}: ${node.displayId}`}
        nodeColor={(node: any) => (isHighlighted(node) ? '#f59e0b' : node.color)}
        linkColor={(link: any) => {
          if (highlightLinks.has(link)) return '#f59e0b';
          if (link.relation === 'BACKBONE') return '#cbd5e1';
          return '#94a3b8';
        }}
        // Disable default node rendering; use custom nodeCanvasObject dots.
        nodeRelSize={0}
        linkWidth={(link: any) => (highlightLinks.has(link) ? 1.2 : 0.5)}
        linkDirectionalParticles={2}
        linkDirectionalParticleSpeed={0.004}
        onNodeClick={(node: any) => {
          console.log('CLICKED:', node);
          setSelectedNode({ ...node });
          if (onNodeSelect) onNodeSelect({ ...node });
          traceGraph(node);
          if (fgRef.current) {
            fgRef.current.centerAt(node.x, node.y, 500);
            fgRef.current.zoom(2, 500);
          }
        }}
        // Increase hit area so clicking small dots is reliable.
        nodePointerAreaPaint={(node: any, color: string, ctx: CanvasRenderingContext2D) => {
          const r = isHighlighted(node) ? 12 : 10;
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.arc(node.x, node.y, r, 0, 2 * Math.PI, false);
          ctx.fill();
        }}
        nodeCanvasObject={(node: any, ctx, scale) => {
          const radius = isHighlighted(node) ? 6 : 4;

          // Draw node (light blue default)
          ctx.beginPath();
          ctx.arc(node.x, node.y, radius, 0, 2 * Math.PI, false);
          ctx.fillStyle = isHighlighted(node) ? '#f59e0b' : '#7dd3fc';
          ctx.fill();

          // Optional border
          ctx.strokeStyle = '#0284c7';
          ctx.lineWidth = 1;
          ctx.stroke();
        }}
        backgroundColor="#ffffff"
      />
    </div>
  );
});
