'use client';

import { TimeToScheduleDistribution } from '@/lib/analytics/types';

interface DistributionChartProps {
  title: string;
  distribution: TimeToScheduleDistribution;
}

export function DistributionChart({
  title,
  distribution,
}: DistributionChartProps) {
  const buckets = [
    { label: '<24h', value: distribution.under24h, color: 'bg-emerald-500' },
    { label: '1-3d', value: distribution['1to3d'], color: 'bg-blue-500' },
    { label: '3-7d', value: distribution['3to7d'], color: 'bg-amber-500' },
    { label: '7d+', value: distribution.over7d, color: 'bg-red-500' },
  ];

  const total = buckets.reduce((sum, bucket) => sum + bucket.value, 0);
  const maxValue = Math.max(...buckets.map((b) => b.value), 1);

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-medium text-slate-300">{title}</h3>
      {total === 0 ? (
        <p className="text-sm text-slate-500">No data available</p>
      ) : (
        <div className="space-y-2">
          {buckets.map((bucket) => {
            const percentage = total > 0 ? (bucket.value / total) * 100 : 0;
            const barWidth = (bucket.value / maxValue) * 100;

            return (
              <div key={bucket.label} className="flex items-center gap-3">
                <span className="text-xs text-slate-400 w-10 text-right">
                  {bucket.label}
                </span>
                <div className="flex-1 h-5 bg-slate-800 rounded overflow-hidden">
                  <div
                    className={`h-full ${bucket.color} rounded transition-all duration-300 flex items-center px-2`}
                    style={{ width: `${Math.max(barWidth, 0)}%` }}
                  >
                    {barWidth > 15 && (
                      <span className="text-xs text-white font-medium">
                        {bucket.value}
                      </span>
                    )}
                  </div>
                </div>
                <span className="text-xs text-slate-500 w-16">
                  {bucket.value} ({percentage.toFixed(0)}%)
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
