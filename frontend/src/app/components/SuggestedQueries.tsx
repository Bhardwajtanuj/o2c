interface SuggestedQueriesProps {
  onQueryClick: (query: string) => void;
}

const QUERIES = [
  { label: '📋 List all orders', query: 'List orders' },
  { label: '🔍 Trace billing 91150083', query: 'Trace billing document 91150083' },
  { label: '📦 Top products by billing', query: 'Which products appear in the most billing documents?' },
  { label: '⚠️ Broken / incomplete flows', query: 'Show broken or incomplete flows' },
  { label: '🚚 Delivered but not billed', query: 'Show deliveries without billing documents' },
  { label: '💳 Outstanding payments', query: 'Show unpaid billing documents' },
  { label: '👥 Top customers by orders', query: 'Which customers have the most orders?' },
  { label: '🛒 Orders without delivery', query: 'Show sales orders without deliveries' },
  { label: '📊 O2C flow overview', query: 'Give me an overview of the order-to-cash flow' },
];

export function SuggestedQueries({ onQueryClick }: SuggestedQueriesProps) {
  return (
    <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-100">
      <h3 className="font-semibold text-sm mb-3">Suggested Queries</h3>
      <div className="space-y-2">
        {QUERIES.map((item, index) => (
          <button
            key={index}
            onClick={() => onQueryClick(item.query)}
            className="w-full text-left px-3 py-2 text-sm bg-gray-50 hover:bg-teal-50 hover:border-teal-200 border border-transparent rounded transition-colors"
          >
            {item.label}
          </button>
        ))}
      </div>
    </div>
  );
}
