import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
} from 'recharts';
import type { DashboardSummary } from '../../types/api';
import { stateColors } from '../../utils/stateColors';

interface FocusDonutProps {
  summary: DashboardSummary;
  compact?: boolean;
}

export function FocusDonut({ summary, compact = false }: FocusDonutProps) {
  const data = Object.entries(summary.focus_state_distribution).map(
    ([state, value]) => ({
      state,
      value: value ?? 0,
    }),
  );

  return (
    <div className="w-full h-full flex flex-col">
      <div className="flex-shrink-0 mb-3">
        <div className="text-sm font-medium uppercase tracking-[0.16em] text-textMuted">
          Focus states
        </div>
        <div className={`mt-0.5 font-serifDisplay ${compact ? 'text-lg' : 'text-xl'} italic text-textPrimary`}>
          Where your mind lives while you learn
        </div>
      </div>
      <div className={`flex-1 min-h-0 flex ${compact ? 'flex-col gap-2' : 'flex-col gap-4 md:flex-row'}`}>
        <div className={compact ? 'h-32 flex-1' : 'h-56 flex-1'}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <RechartsTooltip
                contentStyle={{
                  background: 'rgba(30, 41, 59, 0.95)',
                  border: '1px solid rgba(45, 212, 191, 0.4)',
                  borderRadius: 12,
                  fontSize: 12,
                  color: '#F1F5F9',
                  boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
                }}
                formatter={(value: number, _name, { payload }) => [
                  `${Math.round(value * 100)}%`,
                  payload?.state,
                ]}
              />
              <Pie
                data={data}
                dataKey="value"
                nameKey="state"
                innerRadius={compact ? "50%" : "60%"}
                outerRadius={compact ? "80%" : "90%"}
                paddingAngle={2}
                isAnimationActive
              >
                {data.map((entry) => (
                  <Cell
                    key={entry.state}
                    fill={stateColors[entry.state as keyof typeof stateColors]}
                    stroke={stateColors[entry.state as keyof typeof stateColors]}
                  />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
        </div>

        {!compact && (
          <div className="flex flex-1 flex-col justify-center gap-2 text-xs">
            {data.map((entry) => (
              <div
                key={entry.state}
                className="flex items-center justify-between gap-3 text-textMuted"
              >
                <div className="flex items-center gap-2">
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{
                      backgroundColor:
                        stateColors[entry.state as keyof typeof stateColors],
                    }}
                  />
                  <span className="text-[11px] uppercase tracking-[0.18em] text-textFaint">
                    {entry.state.replace('_', ' ')}
                  </span>
                </div>
                <span className="font-monoData text-xs text-textPrimary">
                  {Math.round(entry.value * 100)}%
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

