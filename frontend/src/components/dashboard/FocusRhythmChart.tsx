import { useState } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { motion } from 'framer-motion';
import type { DashboardSummary, SessionListItem } from '../../types/api';

interface FocusRhythmChartProps {
  summary: DashboardSummary;
  sessions: SessionListItem[];
}

interface DayData {
  date: string;
  [key: string]: number | string;
}

function buildFocusRhythmData(
  sessions: SessionListItem[],
  days: number = 30
): DayData[] {
  const data: DayData[] = [];
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;

  // Group real sessions by date
  const sessionsByDate = new Map<string, SessionListItem[]>();
  sessions.forEach((session) => {
    const dateStr = new Date(session.started_at).toISOString().split('T')[0];
    if (!sessionsByDate.has(dateStr)) {
      sessionsByDate.set(dateStr, []);
    }
    sessionsByDate.get(dateStr)!.push(session);
  });

  // Build one entry per day — only real session data, no synthetic fill
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(now - i * dayMs);
    const dateStr = date.toISOString().split('T')[0];

    const dayData: DayData = {
      date: dateStr,
      total: 0,
    };

    const daySessions = sessionsByDate.get(dateStr) || [];

    if (daySessions.length > 0) {
      let totalMinutes = 0;
      daySessions.forEach((session) => {
        totalMinutes += session.duration_seconds / 60;
      });
      // Show total study time only — per-state breakdown requires
      // session-level state data from the backend (not available on SessionListItem).
      dayData.total = Math.round(totalMinutes);
    }

    data.push(dayData);
  }

  return data;
}

function generateSummary(data: DayData[]): string {
  const totalMinutes = data.reduce((sum, d) => sum + (d.total as number), 0);
  const totalHours = totalMinutes / 60;

  if (totalMinutes === 0) {
    return 'No study sessions recorded yet. Start a session in the overlay to see your rhythm here.';
  }

  // Find best week
  let bestWeek = { start: 0, hours: 0 };
  for (let i = 0; i <= data.length - 7; i++) {
    const weekData = data.slice(i, i + 7);
    const weekHours = weekData.reduce((sum, d) => sum + (d.total as number), 0) / 60;

    if (weekHours > bestWeek.hours) {
      bestWeek = {
        start: new Date(weekData[0].date).getTime(),
        hours: weekHours,
      };
    }
  }

  const bestWeekStart = new Date(bestWeek.start);
  const bestWeekEnd = new Date(bestWeek.start + 7 * 24 * 60 * 60 * 1000);
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const weekStr = `${monthNames[bestWeekStart.getMonth()]} ${bestWeekStart.getDate()}–${bestWeekEnd.getDate()}`;

  const weeks = data.length / 7;
  const avgHours = weeks > 0 ? totalHours / weeks : 0;
  const thisWeekHours = data.slice(-7).reduce((sum, d) => sum + (d.total as number), 0) / 60;
  const vsAvg = avgHours > 0 ? ((thisWeekHours - avgHours) / avgHours) * 100 : 0;

  return `Your best week was ${weekStr} with ${bestWeek.hours.toFixed(1)}h of study. This week you're ${Math.round(Math.abs(vsAvg))}% ${vsAvg >= 0 ? 'above' : 'below'} your average.`;
}

export function FocusRhythmChart({ summary, sessions }: FocusRhythmChartProps) {
  const [range, setRange] = useState<'7' | '30' | '90'>('30');

  const days = range === '7' ? 7 : range === '30' ? 30 : 90;
  const data = buildFocusRhythmData(sessions, days);
  const summaryText = generateSummary(data);

  // Format date for X axis
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return `${date.getMonth() + 1}/${date.getDate()}`;
  };

  return (
    <div className="w-full h-full space-y-4">
      <div className="flex items-end justify-between">
        <div>
          <div className="text-sm font-medium uppercase tracking-[0.16em] text-textMuted">
            Focus Rhythm
          </div>
          <div className="mt-1 font-serifDisplay text-xl italic text-textPrimary">
            The centerpiece of your learning
          </div>
        </div>
      </div>

      <div className="w-full">
        {/* Controls */}
        <div className="mb-6 flex flex-wrap items-center gap-3">
          <div className="flex gap-1 rounded-lg glass-strong p-1">
            {(['7', '30', '90'] as const).map((r) => (
              <button
                key={r}
                onClick={() => setRange(r)}
                className={`rounded-lg px-3 py-1 text-xs font-medium transition-all ${
                  range === r
                    ? 'glass-strong bg-white/10 text-textPrimary shadow-lg'
                    : 'text-textMuted hover:text-textPrimary hover:glass'
                }`}
              >
                {r === '7' ? '7 days' : r === '30' ? '30 days' : '3 months'}
              </button>
            ))}
          </div>

        </div>

        {/* Chart */}
        <div className="h-[280px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={data}
              margin={{ top: 10, right: 10, left: 0, bottom: 10 }}
            >
              <defs>
                <linearGradient id="gradient-total" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#8B5CF6" stopOpacity={0.6} />
                  <stop offset="100%" stopColor="#8B5CF6" stopOpacity={0.15} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="rgba(255, 255, 255, 0.05)" strokeDasharray="3 3" />
              <XAxis
                dataKey="date"
                tickFormatter={formatDate}
                tick={{ fill: '#B0B0B0', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                interval={range === '7' ? 0 : range === '30' ? 4 : 12}
              />
              <YAxis
                tick={{ fill: '#B0B0B0', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                contentStyle={{
                  background: 'rgba(26, 26, 26, 0.95)',
                  backdropFilter: 'blur(20px)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: 12,
                  fontSize: 12,
                  boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
                  color: '#FFFFFF',
                }}
                formatter={(value: number) => [`${Math.round(value)} min`, 'Study time']}
              />
              <Area
                type="monotone"
                dataKey="total"
                stroke="#8B5CF6"
                fill="url(#gradient-total)"
                strokeWidth={1.5}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Summary */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="mt-4 text-sm leading-relaxed text-textMuted"
        >
          {summaryText}
        </motion.p>
      </div>
    </div>
  );
}
