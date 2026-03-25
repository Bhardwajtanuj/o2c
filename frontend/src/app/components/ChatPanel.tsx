import { useState, useRef, useEffect } from 'react';
import { Send, User, ThumbsUp, ThumbsDown, RefreshCw, MoreVertical, Sparkles } from 'lucide-react';
import { motion } from 'motion/react';
import { Tooltip } from './Tooltip';

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

interface ChatPanelProps {
  onQuery: (message: string) => void;
  messages: Message[];
  isLoading?: boolean;
}

export function ChatPanel({ onQuery, messages, isLoading }: ChatPanelProps) {
  const [inputValue, setInputValue] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputValue.trim()) {
      onQuery(inputValue);
      setInputValue('');
    }
  };

  return (
    <div className="w-[400px] bg-white border-l border-gray-200 flex flex-col h-screen">
      {/* Header */}
      <div className="p-4 border-b border-gray-200 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="bg-teal-100 p-1.5 rounded">
            <Sparkles size={16} className="text-teal-600" />
          </div>
          <div>
            <h2 className="font-semibold">Intelligence Flow (Chat) Panel</h2>
          </div>
        </div>
        <Tooltip content="More options">
          <button className="p-1 hover:bg-gray-100 rounded">
            <MoreVertical size={18} className="text-gray-500" />
          </button>
        </Tooltip>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((message, index) => (
          <motion.div
            key={index}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            {message.role === 'user' ? (
              <div className="flex items-start gap-2">
                <div className="bg-teal-600 rounded-full p-2 flex items-center justify-center">
                  <User size={16} className="text-white" />
                </div>
                <div className="flex-1 bg-teal-50 rounded-lg p-3">
                  <p className="text-sm">{message.content}</p>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-start gap-2">
                  <div className="bg-gray-200 rounded-full p-2 flex items-center justify-center">
                    <Sparkles size={16} className="text-gray-600" />
                  </div>
                  <div className="flex-1">
                    <button
                      type="button"
                      disabled={isLoading}
                      onClick={() => onQuery('Analyze this flow')}
                      className="bg-gray-900 text-white text-xs px-3 py-1.5 rounded mb-2 hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Analyze this flow
                    </button>
                  </div>
                  <div className="bg-gray-100 rounded-full p-1.5 flex items-center justify-center">
                    <User size={14} className="text-gray-600" />
                  </div>
                </div>

                <div className="ml-10 bg-gray-50 rounded-lg p-3">
                  {message.analysis && (
                    <div className="mt-3 bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                      <div className="bg-gray-900 px-4 py-2 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Sparkles size={14} className="text-teal-400" />
                          <span className="text-xs font-bold text-white uppercase tracking-wider">Flow Analysis</span>
                        </div>
                        <span className="text-[10px] text-gray-400 font-mono">{message.analysis.nodeId}</span>
                      </div>
                      
                      <div className="p-4 space-y-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-[10px] text-gray-500 uppercase font-bold tracking-tight">Focus Node</p>
                            <p className="text-lg font-bold text-gray-900 leading-none mt-1">{message.analysis.displayId}</p>
                            <p className="text-xs text-gray-500 mt-1">{message.analysis.label}</p>
                          </div>
                          <div className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase ${
                            message.analysis.group === 'order' ? 'bg-cyan-100 text-cyan-700' :
                            message.analysis.group === 'delivery' ? 'bg-green-100 text-green-700' :
                            message.analysis.group === 'billing' ? 'bg-orange-100 text-orange-700' :
                            message.analysis.group === 'journal' ? 'bg-red-100 text-red-700' :
                            message.analysis.group === 'payment' ? 'bg-purple-100 text-purple-700' :
                            'bg-gray-100 text-gray-700'
                          }`}>
                            {message.analysis.group}
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                          <div className="bg-gray-50 p-3 rounded-lg border border-gray-100">
                            <p className="text-[10px] text-gray-500 uppercase font-bold">Connections</p>
                            <div className="flex items-baseline gap-1 mt-1">
                              <span className="text-2xl font-bold text-gray-900">{message.analysis.connectedCount}</span>
                              <span className="text-[10px] text-gray-500 font-medium">nodes</span>
                            </div>
                          </div>
                          <div className="bg-teal-50 p-3 rounded-lg border border-teal-100">
                            <p className="text-[10px] text-teal-600 uppercase font-bold">Health Score</p>
                            <div className="flex items-baseline gap-1 mt-1">
                              <span className="text-2xl font-bold text-teal-700">98</span>
                              <span className="text-[10px] text-teal-600 font-medium">%</span>
                            </div>
                          </div>
                        </div>

                        <div className="space-y-2">
                          <p className="text-[10px] text-gray-500 uppercase font-bold">Network Composition</p>
                          <div className="flex h-2 w-full rounded-full overflow-hidden bg-gray-100">
                            {Object.entries(message.analysis.groupBreakdown).map(([group, count]) => (
                              <div
                                key={group}
                                style={{ width: `${(count / (message.analysis?.connectedCount || 1)) * 100}%` }}
                                className={`${
                                  group === 'order' ? 'bg-cyan-500' :
                                  group === 'delivery' ? 'bg-green-500' :
                                  group === 'billing' ? 'bg-orange-500' :
                                  group === 'journal' ? 'bg-red-500' :
                                  group === 'payment' ? 'bg-purple-500' :
                                  'bg-gray-400'
                                }`}
                              />
                            ))}
                          </div>
                          <div className="flex flex-wrap gap-x-4 gap-y-1">
                            {Object.entries(message.analysis.groupBreakdown).map(([group, count]) => (
                                <div key={group} className="flex items-center gap-1.5">
                                  <div className={`w-1.5 h-1.5 rounded-full ${
                                    group === 'order' ? 'bg-cyan-500' :
                                    group === 'delivery' ? 'bg-green-500' :
                                    group === 'billing' ? 'bg-orange-500' :
                                    group === 'journal' ? 'bg-red-500' :
                                    group === 'payment' ? 'bg-purple-500' :
                                    'bg-gray-400'
                                  }`} />
                                  <span className="text-[10px] text-gray-600 capitalize font-medium">{group}: <span className="text-gray-900 font-bold">{count}</span></span>
                                </div>
                              ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {message.content && (
                    <p className={`text-sm text-gray-700 ${message.analysis ? 'mt-4 border-t border-gray-100 pt-3 italic' : ''}`}>
                      {message.content}
                    </p>
                  )}
                  
                  {message.chart && (
                    <div className="mt-3 bg-white rounded p-2 border border-gray-200">
                      <img src={message.chart} alt="Analysis chart" className="w-full" />
                      <p className="text-xs text-gray-500 mt-2">Analysis chart</p>
                    </div>
                  )}
                  
                  {message.products && message.products.length > 0 && (
                    <div className="mt-3 space-y-2">
                      {message.products.map((product, idx) => (
                        <div key={idx} className="bg-yellow-100 border border-yellow-300 text-xs px-3 py-1.5 rounded inline-block mr-2">
                          {product}
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="flex items-center gap-2 mt-3">
                    <Tooltip content="Helpful response">
                      <button className="p-1.5 hover:bg-gray-200 rounded transition-colors">
                        <ThumbsUp size={14} className="text-gray-500" />
                      </button>
                    </Tooltip>
                    <Tooltip content="Not helpful">
                      <button className="p-1.5 hover:bg-gray-200 rounded transition-colors">
                        <ThumbsDown size={14} className="text-gray-500" />
                      </button>
                    </Tooltip>
                    <Tooltip content="Regenerate response">
                      <button className="p-1.5 hover:bg-gray-200 rounded transition-colors">
                        <RefreshCw size={14} className="text-gray-500" />
                      </button>
                    </Tooltip>
                  </div>
                </div>
              </div>
            )}
          </motion.div>
        ))}
        
        {isLoading && (
          <div className="flex items-center gap-2 text-gray-500 text-sm">
            <div className="animate-spin">
              <RefreshCw size={16} />
            </div>
            <span>Analyzing...</span>
          </div>
        )}
        
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-4 border-t border-gray-200">
        <form onSubmit={handleSubmit} className="flex items-center gap-2">
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="Ask about trends, broken flows, or specific IDs..."
            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
          />
          <Tooltip content="Send message">
            <button
              type="submit"
              disabled={!inputValue.trim() || isLoading}
              className="bg-teal-600 text-white p-2 rounded-lg hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <Send size={18} />
            </button>
          </Tooltip>
        </form>
        <div className="flex items-center gap-2 mt-2 text-xs text-gray-500">
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 bg-green-500 rounded-full"></div>
            <span>Backend: Online</span>
          </div>
          <div className="flex items-center gap-1 ml-auto">
            <span>LLM: OpenRouter</span>
          </div>
        </div>
      </div>
    </div>
  );
}