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
}

export function FocusHeatmap({ summary }: FocusHeatmapProps) {
  const raw = summary.focus_heatmap;
  const data = [
    { label: 'morning', value: raw.morning },
    { label: 'afternoon', value: raw.afternoon },
    { label: 'evening', value: raw.evening },
    { label: 'night', value: raw.night },
  ];

  return (
    <section className="space-y-4">
      <div className="flex items-end justify-between">
        <div>
          <div className="text-sm font-medium uppercase tracking-[0.16em] text-textMuted">
            Time of day
          </div>
          <div className="mt-1 font-serifDisplay text-xl italic text-textPrimary">
            When your focus tends to hold
          </div>
        </div>
      </div>
      <div className="h-56">
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
              tick={{ fill: '#B0B0B0', fontSize: 11 }}
              axisLine={false}
              tickLine={false}
            />
            <RechartsTooltip
              contentStyle={{
                background: 'rgba(26, 26, 26, 0.95)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
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
                <stop offset="0%" stopColor="#404040" />
                <stop offset="50%" stopColor="#737373" />
                <stop offset="100%" stopColor="#D4D4D4" />
              </linearGradient>
            </defs>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

