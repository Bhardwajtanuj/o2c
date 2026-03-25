import { useState, useEffect, useRef, useCallback } from 'react';
import { ShoppingCart, Truck, FileText, BookOpen, CreditCard, Users, DollarSign, Search } from 'lucide-react';
import { Sidebar } from './components/Sidebar';
import { MetricCard } from './components/MetricCard';
import { GraphVisualization, type GraphVisualizationHandle } from './components/GraphVisualization';
import { ChatPanel } from './components/ChatPanel';
import { Tooltip } from './components/Tooltip';
import { fetchStats, fetchGraphData, queryAPI, GraphData, GraphStats } from './utils/mockApi';
import { processQuery, isO2cFlowOverviewQuestion, O2C_FLOW_OVERVIEW_CANNED } from './utils/queryIntent';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  chart?: string;
  products?: string[];
  analysis?: {
    nodeId: string;
    displayId: string;
    label: string;
    group: string;
    connectedCount: number;
    groupBreakdown: Record<string, number>;
  };
}

export default function App() {
  const [selectedGroups, setSelectedGroups] = useState<string[]>(['order', 'order_item', 'delivery', 'billing', 'journal', 'payment', 'customer', 'product']);
  const [limit, setLimit] = useState(800);
  const [searchQuery, setSearchQuery] = useState('');
  const [graphData, setGraphData] = useState<GraphData>({ nodes: [], edges: [] });
  const [highlightIds, setHighlightIds] = useState<string[]>([]);
  const [activeView, setActiveView] = useState<'graph' | 'intelligence'>('graph');
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content: 'Ask about orders, deliveries, billing docs, payments, or flow tracing.'
    }
  ]);
  const [isLoading, setIsLoading] = useState(false);
  const [stats, setStats] = useState<GraphStats>({
    node_count: 0,
    edge_count: 0,
    by_group: { order: 0, order_item: 0, delivery: 0, billing: 0, journal: 0, payment: 0, customer: 0, product: 0 },
    by_relation: {},
  });
  const [lastTraceNode, setLastTraceNode] = useState<any>(null);
  const graphContainerRef = useRef<HTMLDivElement>(null);
  const graphRef = useRef<GraphVisualizationHandle>(null);
  const [graphDimensions, setGraphDimensions] = useState({ width: 800, height: 600 });

  // Update graph data when filters change
  useEffect(() => {
    fetchGraphData(selectedGroups, limit)
      .then(setGraphData)
      .catch(() => setGraphData({ nodes: [], edges: [] }));
  }, [selectedGroups, limit]);

  useEffect(() => {
    fetchStats()
      .then(setStats)
      .catch(() => {
        // Keep UI usable even when backend is down.
      });
  }, []);

  // Update graph dimensions on resize
  useEffect(() => {
    const updateDimensions = () => {
      if (graphContainerRef.current) {
        const rect = graphContainerRef.current.getBoundingClientRect();
        setGraphDimensions({
          width: rect.width || 800,
          height: rect.height || 600
        });
      }
    };

    // Initial update with a slight delay to ensure layout is ready
    setTimeout(updateDimensions, 100);
    
    updateDimensions();
    window.addEventListener('resize', updateDimensions);
    return () => window.removeEventListener('resize', updateDimensions);
  }, []);

  const handleGroupToggle = (group: string) => {
    setSelectedGroups(prev => 
      prev.includes(group) 
        ? prev.filter(g => g !== group)
        : [...prev, group]
    );
  };

  const handleExplainFlowFromGraph = useCallback(
    async (node: { id: string; label: string; displayId: string; group: string }) => {
      const q = `Trace the full order-to-cash flow for ${node.label} ${node.displayId} (graph node id: ${node.id}). Show the chain: sales order → delivery → billing document → journal entry → payment where it exists. Use only facts from the dataset and cite document numbers.`;
      setIsLoading(true);
      setMessages(prev => [...prev, { role: 'user', content: q }]);
      const historyForApi = [...messages, { role: 'user' as const, content: q }].map(m => ({
        role: m.role,
        content: m.content,
      }));
      try {
        const response = await queryAPI(q, historyForApi);
        setMessages(prev => [
          ...prev,
          {
            role: 'assistant',
            content: response.answer,
            chart: response.chart,
            products: response.products,
          },
        ]);
        if (response.highlight_ids?.length) {
          setHighlightIds(response.highlight_ids);
        }
      } catch {
        setMessages(prev => [
          ...prev,
          {
            role: 'assistant',
            content:
              'Could not run the explain query. Ensure the backend is running and OPENROUTER_API_KEY is set on the server for LLM answers.',
          },
        ]);
      } finally {
        setIsLoading(false);
      }
    },
    [messages]
  );

  const handleQuery = async (message: string) => {
    setMessages(prev => [...prev, { role: 'user', content: message }]);
    const historyForApi = [...messages, { role: 'user' as const, content: message }].map(m => ({
      role: m.role,
      content: m.content,
    }));

    const graphCtx = graphRef.current?.getGraphContext?.();
    const effectiveNode = graphCtx?.selectedNode || lastTraceNode;

    // 🔥 FIX 3: DEBUG LOGS
    console.log("DEBUG: handleQuery Context", {
      message,
      selectedNodeInGraph: graphCtx?.selectedNode,
      lastTraceNode,
      effectiveNode
    });

    const routed = processQuery(message, {
      selectedNode: effectiveNode
        ? {
            id: effectiveNode.id,
            label: effectiveNode.label,
            displayId: effectiveNode.displayId,
            group: effectiveNode.group,
          }
        : null,
      highlightedCount: graphCtx?.highlightedCount ?? 0,
      highlightNodes: graphCtx?.highlightNodes ?? [],
    });

    if (routed.type === 'hint') {
      setMessages(prev => [...prev, { role: 'assistant', content: routed.message }]);
      return;
    }

    if (routed.type === 'graph') {
      const q = routed.query;
      if (q.action === 'TRACE') {
        const node = graphRef.current?.traceByIdOrDisplayId(q.id, q.type) ?? null;
        if (node) {
           setLastTraceNode(node);
        }
        setMessages(prev => [
          ...prev,
          {
            role: 'assistant',
            content: node
              ? `Tracing the network for **${q.type ?? 'entity'}** **${q.id}**. Connected nodes and links are highlighted on the graph.`
              : `No node matched **${q.id}** (type: ${q.type ?? 'any'}) in the current graph. Raise the node limit, enable the right groups, or check the ID.`,
          },
        ]);
        return;
      }
      if (q.action === 'FIND_ANOMALIES') {
        graphRef.current?.highlightAnomalies();
        setMessages(prev => [
          ...prev,
          {
            role: 'assistant',
            content:
              'Highlighted **isolated nodes** on the graph (no incident edges in this view). Expand filters if you expect connections.',
          },
        ]);
        return;
      }
      if (q.action === 'TOP_PRODUCTS') {
        setIsLoading(true);
        try {
          const response = await queryAPI(
            'Which products are associated with the highest number of billing documents?',
            historyForApi
          );
          setMessages(prev => [
            ...prev,
            {
              role: 'assistant',
              content: response.answer,
              chart: response.chart,
              products: response.products,
            },
          ]);
          if (response.highlight_ids?.length) {
            setHighlightIds(response.highlight_ids);
          }
        } catch {
          setMessages(prev => [
            ...prev,
            {
              role: 'assistant',
              content: 'Sorry, there was an error processing your query. Please try again.',
            },
          ]);
        } finally {
          setIsLoading(false);
        }
        return;
      }
      if (q.action === 'ANALYZE_FLOW') {
        const node = graphData.nodes.find((n) => n.id === q.nodeId);
        if (!node) {
          setMessages((prev) => [
            ...prev,
            {
              role: 'assistant',
              content:
                'That node is not in the current graph view. Adjust filters or limit, then select a node again.',
            },
          ]);
          return;
        }

        const localAnalysis = {
          nodeId: node.id,
          displayId: node.displayId,
          label: node.label ?? node.group,
          group: node.group,
          connectedCount: q.connectedCount,
          groupBreakdown: q.groupBreakdown,
        };

        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: `AI analysis of O2C flow for **${node.displayId}** is ready. The network represents the full document chain from order to payment.`,
            analysis: localAnalysis,
          },
        ]);
        
        // Skip calling backend queryAPI for complex "Analyze" queries to prevent SQL generation failures
        // We already have the ground-truth graph state in the analysis card.
        setIsLoading(false);
        return; 
      }
    }

    setIsLoading(true);
    try {
      const apiMessage = isO2cFlowOverviewQuestion(message) ? O2C_FLOW_OVERVIEW_CANNED : message;
      const response = await queryAPI(apiMessage, historyForApi);
      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          content: response.answer,
          chart: response.chart,
          products: response.products,
        },
      ]);

      if (response.highlight_ids) {
        setHighlightIds(response.highlight_ids);
      }
    } catch {
      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          content: 'Sorry, there was an error processing your query. Please try again.',
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const groups = [
    { key: 'order', label: 'order', color: 'bg-cyan-500' },
    { key: 'order_item', label: 'order item', color: 'bg-cyan-300' },
    { key: 'delivery', label: 'delivery', color: 'bg-green-500' },
    { key: 'billing', label: 'billing', color: 'bg-orange-500' },
    { key: 'journal', label: 'journal', color: 'bg-red-500' },
    { key: 'payment', label: 'payment', color: 'bg-purple-500' },
    { key: 'customer', label: 'customer', color: 'bg-yellow-500' },
    { key: 'product', label: 'product', color: 'bg-emerald-500' },
  ];

  return (
    <div className="flex h-screen bg-[#F5F3F0]">
      <Sidebar />
      
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
          <h1 className="text-xl font-semibold">O2C Graph Analytics</h1>
          <div className="flex items-center gap-3">
            <Tooltip content="View graph visualization">
              <button 
                onClick={() => setActiveView('graph')}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm transition-colors ${
                  activeView === 'graph' 
                    ? 'bg-teal-600 text-white' 
                    : 'border border-gray-300 hover:bg-gray-50'
                }`}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.48-8.48l2.83-2.83" />
                </svg>
                Graph
              </button>
            </Tooltip>
            <Tooltip content="View intelligence analytics">
              <button 
                onClick={() => setActiveView('intelligence')}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm transition-colors ${
                  activeView === 'intelligence' 
                    ? 'bg-gray-900 text-white' 
                    : 'border border-gray-300 hover:bg-gray-50'
                }`}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <path d="M12 16v-4m0-4h.01" />
                </svg>
                Intelligence
              </button>
            </Tooltip>
          </div>
        </header>

        {/* Metrics */}
        <div className="px-6 py-4 overflow-x-auto">
          <div className="flex gap-4">
            <MetricCard
              icon={ShoppingCart}
              title="Sales Orders"
              value={`(${stats.by_group.order})`}
              sparklineData={[45, 52, 48, 61, 55, 58, 62]}
              color="text-cyan-600"
              iconBgColor="bg-cyan-100"
            />
            <MetricCard
              icon={Truck}
              title="Deliveries"
              value={stats.by_group.delivery}
              sparklineData={[38, 42, 45, 48, 43, 50, 52]}
              color="text-green-600"
              iconBgColor="bg-green-100"
            />
            <MetricCard
              icon={FileText}
              title="Billing Docs"
              value={`(${stats.by_group.billing})`}
              sparklineData={[68, 72, 75, 78, 82, 85, 88]}
              color="text-orange-600"
              iconBgColor="bg-orange-100"
            />
            <MetricCard
              icon={BookOpen}
              title="Journal Entries"
              value={`(${stats.by_group.journal})`}
              sparklineData={[55, 58, 54, 62, 59, 65, 68]}
              color="text-red-600"
              iconBgColor="bg-red-100"
            />
            <MetricCard
              icon={CreditCard}
              title="Payments"
              value={`(${stats.by_group.payment})`}
              sparklineData={[52, 58, 62, 65, 68, 72, 75]}
              color="text-purple-600"
              iconBgColor="bg-purple-100"
            />
            <MetricCard
              icon={Users}
              title="Customers"
              value={stats.by_group.customer}
              sparklineData={[5, 6, 7, 7, 8, 8, 8]}
              color="text-yellow-600"
              iconBgColor="bg-yellow-100"
            />
            <MetricCard
              icon={DollarSign}
              title="Total Revenue"
              value="(Rs.2.45M)"
              sparklineData={[1.8, 1.9, 2.1, 2.2, 2.3, 2.4, 2.45]}
              color="text-emerald-600"
              iconBgColor="bg-emerald-100"
            />
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 flex gap-4 px-6 pb-6 overflow-hidden">
          {/* Graph Section */}
          <div className="flex-1 flex flex-col gap-4 min-w-0">
            {activeView === 'graph' ? (
              <>
                {/* Controls Card */}
                <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-100">
                  <div className="flex flex-col gap-3">
                    {/* Groups Filter */}
                    <div className="flex items-center gap-3 flex-wrap">
                      <span className="text-sm font-semibold">Groups:</span>
                      {groups.map(group => (
                        <Tooltip key={group.key} content={`Toggle ${group.label} nodes`}>
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={selectedGroups.includes(group.key)}
                              onChange={() => handleGroupToggle(group.key)}
                              className="w-4 h-4 rounded border-gray-300 text-teal-600 focus:ring-teal-500"
                            />
                            <span className={`w-3 h-3 rounded ${group.color}`} />
                            <span className="text-sm">{group.label}</span>
                          </label>
                        </Tooltip>
                      ))}
                    </div>

                    {/* Limit and Search */}
                    <div className="flex items-center gap-6">
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-semibold">Limit:</span>
                        <Tooltip content="Adjust maximum number of nodes displayed">
                          <input
                            type="range"
                            min="100"
                            max="1000"
                            step="100"
                            value={limit}
                            onChange={(e) => setLimit(Number(e.target.value))}
                            className="w-32 cursor-pointer"
                          />
                        </Tooltip>
                        <span className="text-sm font-mono min-w-[3rem]">{limit}</span>
                      </div>

                      <div className="flex items-center gap-2 flex-1">
                        <span className="text-sm font-semibold">Search:</span>
                        <div className="relative flex-1 max-w-xs">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                          <Tooltip content="Search for specific nodes or products">
                            <input
                              type="text"
                              placeholder="Node ID, Product..."
                              value={searchQuery}
                              onChange={(e) => setSearchQuery(e.target.value)}
                              className="w-full pl-9 pr-3 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                            />
                          </Tooltip>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Graph Card */}
                <div className="bg-white rounded-lg shadow-sm border border-gray-100 flex-1 flex flex-col min-h-[520px] overflow-hidden">
                  {/* Graph Container */}
                  <div className="flex-1 relative min-h-0">
                    <Tooltip content="Toggle detailed node overlay">
                      <button className="absolute top-4 left-4 z-10 px-3 py-1.5 bg-white border border-gray-300 rounded text-sm hover:bg-gray-50 transition-colors flex items-center gap-2 shadow-sm">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                          <circle cx="12" cy="12" r="3" />
                        </svg>
                        Hide Granular Overlay
                      </button>
                    </Tooltip>
                    <div ref={graphContainerRef} className="w-full h-full absolute inset-0">
                      <GraphVisualization
                        ref={graphRef}
                        data={graphData}
                        highlightIds={highlightIds}
                        width={graphDimensions.width}
                        height={graphDimensions.height}
                        onExplainFlow={handleExplainFlowFromGraph}
                        explainFlowLoading={isLoading}
                        onNodeSelect={(node) => setLastTraceNode(node)}
                      />
                    </div>
                  </div>

                  {/* Legend */}
                  <div className="p-4 border-t border-gray-100 flex items-center gap-6 text-sm bg-gray-50">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 bg-cyan-400 rounded-full" />
                      <span>Order Hub</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 bg-cyan-600 rounded-full" />
                      <span>Critical Node</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-12 h-0.5 bg-cyan-200" />
                      <span>Connection</span>
                    </div>
                  </div>
                </div>

              </>
            ) : (
              /* Intelligence View */
              <div className="bg-white rounded-lg shadow-sm border border-gray-100 flex-1 flex flex-col p-6 overflow-auto">
                <h2 className="text-lg font-semibold mb-4">Intelligence Analytics</h2>
                <div className="space-y-4">
                  <div className="p-4 bg-teal-50 rounded-lg border border-teal-200">
                    <h3 className="font-semibold text-teal-900 mb-2">Graph Overview</h3>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <p className="text-gray-600">Total Nodes</p>
                        <p className="text-xl font-semibold text-teal-900">{stats.node_count}</p>
                      </div>
                      <div>
                        <p className="text-gray-600">Total Edges</p>
                        <p className="text-xl font-semibold text-teal-900">{stats.edge_count}</p>
                      </div>
                    </div>
                  </div>

                  <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                    <h3 className="font-semibold mb-3">Node Distribution</h3>
                    <div className="space-y-2">
                      {Object.entries(stats.by_group).map(([group, count]) => (
                        <div key={group} className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div className={`w-3 h-3 rounded ${groups.find(g => g.key === group)?.color}`} />
                            <span className="text-sm capitalize">{group}</span>
                          </div>
                          <span className="font-semibold">{count}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <ChatPanel 
        onQuery={handleQuery} 
        messages={messages} 
        isLoading={isLoading}
      />
    </div>
  );
}