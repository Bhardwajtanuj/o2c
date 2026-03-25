import { LayoutGrid, ArrowUpDown, FileText, Settings } from 'lucide-react';
import { Tooltip } from './Tooltip';

export function Sidebar() {
  return (
    <div className="w-12 bg-white border-r border-gray-200 flex flex-col items-center py-4 gap-4">
      <Tooltip content="O2C Analytics">
        <div className="w-8 h-8 flex items-center justify-center rounded-full bg-teal-600 text-white text-xs font-semibold">
          O2C
        </div>
      </Tooltip>
      
      <div className="flex flex-col gap-3 mt-4">
        <Tooltip content="Dashboard">
          <button className="w-8 h-8 flex items-center justify-center text-teal-600 hover:bg-teal-50 rounded transition-colors">
            <LayoutGrid size={20} />
          </button>
        </Tooltip>
        <Tooltip content="Transactions">
          <button className="w-8 h-8 flex items-center justify-center text-gray-400 hover:bg-gray-50 rounded transition-colors">
            <ArrowUpDown size={20} />
          </button>
        </Tooltip>
        <Tooltip content="Reports">
          <button className="w-8 h-8 flex items-center justify-center text-gray-400 hover:bg-gray-50 rounded transition-colors">
            <FileText size={20} />
          </button>
        </Tooltip>
      </div>
      
      <div className="mt-auto">
        <Tooltip content="Settings">
          <button className="w-8 h-8 flex items-center justify-center text-gray-400 hover:bg-gray-50 rounded transition-colors">
            <Settings size={20} />
          </button>
        </Tooltip>
      </div>
    </div>
  );
}