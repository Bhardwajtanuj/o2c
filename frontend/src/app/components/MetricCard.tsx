import { LucideIcon } from 'lucide-react';
import { LineChart, Line, ResponsiveContainer } from 'recharts';
import { Tooltip } from './Tooltip';

interface MetricCardProps {
  icon: LucideIcon;
  title: string;
  value: string | number;
  sparklineData: number[];
  color: string;
  iconBgColor: string;
}

export function MetricCard({ icon: Icon, title, value, sparklineData, color, iconBgColor }: MetricCardProps) {
  const chartData = sparklineData.map((value, index) => ({ value, index }));
  
  return (
    <Tooltip content={`View ${title} details`}>
      <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-100 min-w-[160px] cursor-pointer hover:shadow-md transition-shadow">
        <div className="flex items-start gap-3">
          <div className={`${iconBgColor} rounded-lg p-2 flex items-center justify-center`}>
            <Icon size={20} className={color} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm text-gray-600 mb-1">{title}</div>
            <div className="font-semibold text-lg">{value}</div>
          </div>
        </div>
        <div className="mt-2 h-12 w-full">
          <ResponsiveContainer width="100%" height={48}>
            <LineChart data={chartData}>
              <Line 
                type="monotone" 
                dataKey="value" 
                stroke={color.replace('text-', '#').replace('cyan', '#06b6d4').replace('green', '#10b981').replace('orange', '#f97316').replace('red', '#ef4444').replace('purple', '#a855f7').replace('yellow', '#eab308').replace('emerald', '#10b981')} 
                strokeWidth={2} 
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </Tooltip>
  );
}