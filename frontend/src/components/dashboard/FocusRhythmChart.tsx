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
import { stateColors } from '../../utils/stateColors';
import { LearnerState } from '../../types/states';

interface FocusRhythmChartProps {
  summary: DashboardSummary;
  sessions: SessionListItem[];
}

interface DayData {
  date: string;
  [key: string]: number | string;
}

function generateFocusRhythmData(
  sessions: SessionListItem[],
  days: number = 30
): DayData[] {
  const data: DayData[] = [];
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;

  // Initialize all days
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(now - i * dayMs);
    const dateStr = date.toISOString().split('T')[0];
    
    const dayData: DayData = {
      date: dateStr,
      FLOW: 0,
      CONFUSION: 0,
      MIND_WANDER: 0,
      INSIGHT: 0,
      FRUSTRATION: 0,
      OVERLOAD: 0,
      BOREDOM: 0,
      total: 0,
    };

    // Aggregate sessions for this day
    sessions.forEach((session) => {
      const sessionDate = new Date(session.started_at).toISOString().split('T')[0];
      if (sessionDate === dateStr) {
        dayData[session.dominant_state] += session.duration_minutes;
        dayData.total += session.duration_minutes;
      }
    });

    data.push(dayData);
  }

  return data;
}

function generateSummary(data: DayData[]): string {
  const totalMinutes = data.reduce((sum, d) => sum + (d.total as number), 0);
  const totalHours = totalMinutes / 60;
  
  const flowMinutes = data.reduce((sum, d) => sum + (d.FLOW as number), 0);
  const flowPercent = totalMinutes > 0 ? (flowMinutes / totalMinutes) * 100 : 0;
  
  // Find best week
  let bestWeek = { start: 0, hours: 0, flow: 0 };
  for (let i = 0; i <= data.length - 7; i++) {
    const weekData = data.slice(i, i + 7);
    const weekHours = weekData.reduce((sum, d) => sum + (d.total as number), 0) / 60;
    const weekFlow = weekData.reduce((sum, d) => sum + (d.FLOW as number), 0);
    const weekTotal = weekData.reduce((sum, d) => sum + (d.total as number), 0);
    const weekFlowPercent = weekTotal > 0 ? (weekFlow / weekTotal) * 100 : 0;
    
    if (weekHours > bestWeek.hours) {
      const startDate = new Date(weekData[0].date);
      bestWeek = {
        start: startDate.getTime(),
        hours: weekHours,
        flow: weekFlowPercent,
      };
    }
  }

  const bestWeekStart = new Date(bestWeek.start);
  const bestWeekEnd = new Date(bestWeek.start + 7 * 24 * 60 * 60 * 1000);
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const weekStr = `${monthNames[bestWeekStart.getMonth()]} ${bestWeekStart.getDate()}–${bestWeekEnd.getDate()}`;

  const avgHours = totalHours / (data.length / 7);
  const thisWeekHours = data.slice(-7).reduce((sum, d) => sum + (d.total as number), 0) / 60;
  const vsAvg = ((thisWeekHours - avgHours) / avgHours) * 100;

  return `Your best week was ${weekStr} with ${bestWeek.hours.toFixed(1)}h of study, ${Math.round(bestWeek.flow)}% in flow. This week you're ${Math.round(Math.abs(vsAvg))}% ${vsAvg >= 0 ? 'above' : 'below'} your average.`;
}

export function FocusRhythmChart({ summary, sessions }: FocusRhythmChartProps) {
  const [range, setRange] = useState<'7' | '30' | '90'>('30');
  const [mode, setMode] = useState<'stack' | 'proportion'>('stack');

  const days = range === '7' ? 7 : range === '30' ? 30 : 90;
  const data = generateFocusRhythmData(sessions, days);
  const summaryText = generateSummary(data);

  const states: LearnerState[] = ['FLOW', 'CONFUSION', 'MIND_WANDER', 'INSIGHT', 'FRUSTRATION', 'OVERLOAD', 'BOREDOM'];

  // Format date for X axis
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return `${date.getMonth() + 1}/${date.getDate()}`;
  };

  return (
    <section className="mb-12 space-y-4">
      <div className="flex items-end justify-between">
        <div>
          <div className="text-xs font-medium uppercase tracking-[0.16em] text-textMuted">
            Focus Rhythm
          </div>
          <div className="mt-1 font-serifDisplay text-lg italic text-textPrimary">
            The centerpiece of your learning
          </div>
        </div>
      </div>

      <div className="glass rounded-2xl p-6">
        {/* Controls */}
        <div className="mb-6 flex flex-wrap items-center gap-3">
          <div className="flex gap-1 rounded-lg glass-strong p-1">
            {(['7', '30', '90'] as const).map((r) => (
              <button
                key={r}
                onClick={() => setRange(r)}
                className={`rounded-lg px-3 py-1 text-xs font-medium transition-all ${
                  range === r
                    ? 'glass-strong bg-accentViolet/30 text-textPrimary shadow-lg'
                    : 'text-textMuted hover:text-textPrimary hover:glass'
                }`}
              >
                {r === '7' ? '7 days' : r === '30' ? '30 days' : '3 months'}
              </button>
            ))}
          </div>

          <div className="flex gap-1 rounded-lg glass-strong p-1">
            {(['stack', 'proportion'] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`rounded-lg px-3 py-1 text-xs font-medium transition-all ${
                  mode === m
                    ? 'glass-strong bg-accentViolet/30 text-textPrimary shadow-lg'
                    : 'text-textMuted hover:text-textPrimary hover:glass'
                }`}
              >
                {m === 'stack' ? 'Stack' : 'Proportion'}
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
                {states.map((state) => (
                  <linearGradient key={state} id={`gradient-${state}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={stateColors[state]} stopOpacity={0.7} />
                    <stop offset="100%" stopColor={stateColors[state]} stopOpacity={0.2} />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid stroke="#26263A" strokeDasharray="3 3" />
              <XAxis
                dataKey="date"
                tickFormatter={formatDate}
                tick={{ fill: '#8A89A4', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                interval={range === '7' ? 0 : range === '30' ? 4 : 12}
              />
              <YAxis
                tick={{ fill: '#8A89A4', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                contentStyle={{
                  background: '#111119',
                  border: '1px solid #26263A',
                  borderRadius: 8,
                  fontSize: 12,
                }}
                formatter={(value: number, name: string) => [
                  `${Math.round(value)} min`,
                  name.replace('_', ' '),
                ]}
              />
              {states.map((state) => (
                <Area
                  key={state}
                  type="monotone"
                  dataKey={state}
                  stackId={mode === 'stack' ? '1' : undefined}
                  stroke={stateColors[state]}
                  fill={`url(#gradient-${state})`}
                  strokeWidth={1.5}
                />
              ))}
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
    </section>
  );
}
