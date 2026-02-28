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
import { formatPeakRange } from '../../utils/formatters';

interface FocusHeatmapProps {
  summary: DashboardSummary;
}

export function FocusHeatmap({ summary }: FocusHeatmapProps) {
  const raw = summary.focus_heatmap;
  const data = [
    { label: 'morning', value: raw.morning },
    { label: 'afternoon', value: raw.afternoon },
    { label: 'night', value: raw.night },
  ];

  return (
    <section className="space-y-4">
      <div className="flex items-end justify-between">
        <div>
          <div className="text-xs font-medium uppercase tracking-[0.16em] text-textMuted">
            Time of day
          </div>
          <div className="mt-1 font-serifDisplay text-lg italic text-textPrimary">
            When your focus tends to hold
          </div>
        </div>
      </div>
      <Card className="flex flex-col gap-4" hoverable>

      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            layout="vertical"
            margin={{ top: 8, right: 16, left: 0, bottom: 8 }}
          >
            <CartesianGrid
              horizontal={false}
              stroke="#26263A"
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
              tickFormatter={(label) => formatPeakRange(label as 'morning' | 'afternoon' | 'night')}
              tick={{ fill: '#8A89A4', fontSize: 11 }}
              axisLine={false}
              tickLine={false}
            />
            <RechartsTooltip
              contentStyle={{
                background: '#111119',
                border: '1px solid #26263A',
                borderRadius: 8,
                fontSize: 12,
              }}
              formatter={(value: number, name, { payload }) => [
                `${Math.round(value * 100)}% focus quality`,
                formatPeakRange(payload?.label as 'morning' | 'afternoon' | 'night'),
              ]}
            />
            <Bar
              dataKey="value"
              radius={6}
              fill="url(#focusGradient)"
            />
            <defs>
              <linearGradient id="focusGradient" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#3E3D56" />
                <stop offset="60%" stopColor="#7C6EF5" />
                <stop offset="100%" stopColor="#52C99A" />
              </linearGradient>
            </defs>
          </BarChart>
        </ResponsiveContainer>
      </div>
      </Card>
    </section>
  );
}

