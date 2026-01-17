'use client';

interface MetricCardProps {
  label: string;
  value: string | number;
  subtitle?: string;
  trend?: 'up' | 'down' | 'neutral';
  color?: 'emerald' | 'amber' | 'red' | 'blue' | 'slate';
}

export function MetricCard({
  label,
  value,
  subtitle,
  color = 'slate',
}: MetricCardProps) {
  const colorClasses = {
    emerald: 'border-emerald-500/30 bg-emerald-500/10',
    amber: 'border-amber-500/30 bg-amber-500/10',
    red: 'border-red-500/30 bg-red-500/10',
    blue: 'border-blue-500/30 bg-blue-500/10',
    slate: 'border-slate-700 bg-slate-800/50',
  };

  const valueColorClasses = {
    emerald: 'text-emerald-400',
    amber: 'text-amber-400',
    red: 'text-red-400',
    blue: 'text-blue-400',
    slate: 'text-white',
  };

  return (
    <div
      className={`rounded-lg border p-4 ${colorClasses[color]}`}
    >
      <p className="text-sm text-slate-400 font-medium">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${valueColorClasses[color]}`}>
        {value}
      </p>
      {subtitle && (
        <p className="text-xs text-slate-500 mt-1">{subtitle}</p>
      )}
    </div>
  );
}
