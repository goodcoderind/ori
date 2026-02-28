import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
} from 'recharts';
import type { DashboardSummary } from '../../types/api';
import { Card } from '../ui/Card';
import { formatPeriod } from '../../utils/formatters';

interface FocusHeatmapProps {
  summary: DashboardSummary;
  compact?: boolean;
}

export function FocusHeatmap({ summary, compact = false }: FocusHeatmapProps) {
  const raw = summary.focus_heatmap;
  const data = [
    { label: 'morning', value: raw.morning },
    { label: 'afternoon', value: raw.afternoon },
    { label: 'evening', value: raw.evening },
    { label: 'night', value: raw.night },
  ];

  return (
    <div className="w-full h-full flex flex-col">
      <div className="flex-shrink-0 mb-3">
        <div className="text-sm font-medium uppercase tracking-[0.16em] text-textMuted">
          Time of day
        </div>
        <div className={`mt-0.5 font-serifDisplay ${compact ? 'text-lg' : 'text-xl'} italic text-textPrimary`}>
          When your focus tends to hold
        </div>
      </div>
      <div className={`flex-1 min-h-0 ${compact ? 'h-32' : 'h-56'}`}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            layout="vertical"
            margin={{ top: 8, right: 16, left: 0, bottom: 8 }}
          >
            <CartesianGrid
              horizontal={false}
              stroke="rgba(255, 255, 255, 0.05)"
              strokeDasharray="3 3"
            />
            <XAxis
              type="number"
              domain={[0, 1]}
              hide
            />
            <YAxis
              dataKey="label"
              type="category"
              tickFormatter={(label) => formatPeriod(label)}
              tick={{ fill: '#B0B0B0', fontSize: compact ? 10 : 11 }}
              axisLine={false}
              tickLine={false}
              width={compact ? 50 : 60}
            />
            <RechartsTooltip
              contentStyle={{
                background: 'rgba(28, 28, 40, 0.95)',
                border: '1px solid rgba(156, 124, 255, 0.2)',
                borderRadius: 12,
                fontSize: 12,
                color: '#FFFFFF',
                boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
              }}
              formatter={(value: number, name, { payload }) => [
                `${Math.round(value * 100)}% focus quality`,
                formatPeriod(payload?.label || ''),
              ]}
            />
            <Bar
              dataKey="value"
              radius={6}
              fill="url(#focusGradient)"
            />
            <defs>
              <linearGradient id="focusGradient" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#9C7CFF" stopOpacity="0.4" />
                <stop offset="50%" stopColor="#BFA8FF" stopOpacity="0.6" />
                <stop offset="100%" stopColor="#6EE7F9" stopOpacity="0.8" />
              </linearGradient>
            </defs>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

