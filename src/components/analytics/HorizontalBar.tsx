'use client';

interface BarItem {
  label: string;
  value: number;
  color?: 'emerald' | 'amber' | 'red' | 'blue' | 'slate' | 'purple';
}

interface HorizontalBarProps {
  title: string;
  items: BarItem[];
  showPercentage?: boolean;
}

export function HorizontalBar({
  title,
  items,
  showPercentage = true,
}: HorizontalBarProps) {
  const total = items.reduce((sum, item) => sum + item.value, 0);
  const maxValue = Math.max(...items.map((item) => item.value), 1);

  const colorClasses = {
    emerald: 'bg-emerald-500',
    amber: 'bg-amber-500',
    red: 'bg-red-500',
    blue: 'bg-blue-500',
    slate: 'bg-slate-500',
    purple: 'bg-purple-500',
  };

  const textColorClasses = {
    emerald: 'text-emerald-400',
    amber: 'text-amber-400',
    red: 'text-red-400',
    blue: 'text-blue-400',
    slate: 'text-slate-400',
    purple: 'text-purple-400',
  };

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-medium text-slate-300">{title}</h3>
      <div className="space-y-2">
        {items.map((item) => {
          const percentage = total > 0 ? (item.value / total) * 100 : 0;
          const barWidth = (item.value / maxValue) * 100;
          const color = item.color || 'slate';

          return (
            <div key={item.label} className="space-y-1">
              <div className="flex justify-between text-xs">
                <span className="text-slate-400">{item.label}</span>
                <span className={textColorClasses[color]}>
                  {item.value}
                  {showPercentage && total > 0 && (
                    <span className="text-slate-500 ml-1">
                      ({percentage.toFixed(1)}%)
                    </span>
                  )}
                </span>
              </div>
              <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                <div
                  className={`h-full ${colorClasses[color]} rounded-full transition-all duration-300`}
                  style={{ width: `${barWidth}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
