import { motion } from 'framer-motion';
import type { DashboardSummary } from '../../types/api';
import { Card } from '../ui/Card';
import { ProgressBar } from '../ui/ProgressBar';

interface TechniqueTableProps {
  summary: DashboardSummary;
}

// Mock usage counts and trends - in real app, this would come from API
const techniqueUsage: Record<string, { count: number; trend: number }> = {
  'Feynman Explanation': { count: 24, trend: 5 },
  'Modality Switching': { count: 18, trend: 8 },
  'Active Recall': { count: 12, trend: -3 },
  'Elaborative Interrogation': { count: 9, trend: 2 },
  Pomodoro: { count: 31, trend: 0 },
};

export function TechniqueTable({ summary }: TechniqueTableProps) {
  const entries = Object.entries(summary.technique_success_rates).sort(
    (a, b) => b[1] - a[1],
  );

  const container = {
    hidden: { opacity: 0, y: 12 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { staggerChildren: 0.04, delayChildren: 0.05 },
    },
  };

  const item = {
    hidden: { opacity: 0, y: 8 },
    visible: { opacity: 1, y: 0 },
  };

  return (
    <section className="space-y-4">
      <div className="flex items-end justify-between">
        <div>
          <div className="text-xs font-medium uppercase tracking-[0.16em] text-textMuted">
            Techniques
          </div>
          <div className="mt-1 font-serifDisplay text-lg italic text-textPrimary">
            What actually works for you
          </div>
        </div>
      </div>

      <div className="glass rounded-2xl p-6">
        <motion.div
          variants={container}
          initial="hidden"
          animate="visible"
          className="space-y-4"
        >
          {entries.map(([name, value], index) => {
            const usage = techniqueUsage[name] || { count: 0, trend: 0 };
            const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`;
            const trendIcon = usage.trend > 0 ? '↑' : usage.trend < 0 ? '↓' : '→';
            const trendColor = usage.trend > 0 ? '#52C99A' : usage.trend < 0 ? '#E06060' : '#8A89A4';
            
            return (
              <motion.div
                key={name}
                variants={item}
                className="group relative glass rounded-xl p-4 transition-all hover:border-accentViolet/40"
              >
                <div className="mb-3 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-lg">{medal}</span>
                    <div className="font-medium text-textPrimary">{name}</div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <div className="font-monoData text-sm font-medium text-textPrimary">
                        {Math.round(value * 100)}%
                      </div>
                      <div className="text-xs text-textMuted">YOUR RATE</div>
                    </div>
                  </div>
                </div>
                <div className="mb-2">
                  <ProgressBar
                    value={value}
                    color="#7C6EF5"
                    height={8}
                  />
                </div>
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-4">
                    <div>
                      <span className="font-monoData text-textMuted">{usage.count}x</span>
                      <span className="ml-1 text-textFaint">USED</span>
                    </div>
                    <div style={{ color: trendColor }}>
                      <span>{trendIcon}</span>
                      {usage.trend !== 0 && (
                        <span className="ml-1">{Math.abs(usage.trend)}%</span>
                      )}
                      <span className="ml-1 text-textFaint">TREND</span>
                    </div>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </motion.div>
      </div>
    </section>
  );
}

