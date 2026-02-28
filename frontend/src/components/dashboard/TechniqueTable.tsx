import { motion } from 'framer-motion';
import type { DashboardSummary } from '../../types/api';
import { Card } from '../ui/Card';
import { ProgressBar } from '../ui/ProgressBar';
import { formatTechniqueId, formatPercent } from '../../utils/formatters';

interface TechniqueTableProps {
  summary: DashboardSummary;
}

export function TechniqueTable({ summary }: TechniqueTableProps) {
  // technique_success_rates is now an ARRAY
  const entries = [...summary.technique_success_rates].sort(
    (a, b) => b.success_rate - a.success_rate,
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
          {entries.map((entry, index) => {
            const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`;
            const techniqueName = formatTechniqueId(entry.technique_id);
            
            return (
              <motion.div
                key={entry.technique_id}
                variants={item}
                className="group relative glass rounded-xl p-4 transition-all hover:border-accentViolet/40"
              >
                <div className="mb-3 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-lg">{medal}</span>
                    <div className="font-medium text-textPrimary">{techniqueName}</div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <div className="font-monoData text-sm font-medium text-textPrimary">
                        {formatPercent(entry.success_rate)}
                      </div>
                      <div className="text-xs text-textMuted">SUCCESS RATE</div>
                    </div>
                  </div>
                </div>
                <ProgressBar value={entry.success_rate} color="#7C6EF5" />
                <div className="mt-2 flex items-center justify-between text-xs text-textMuted">
                  <span>shown {entry.shown_count}×</span>
                  <span>accepted {formatPercent(entry.acceptance_rate)}</span>
                </div>
              </motion.div>
            );
          })}
        </motion.div>
      </div>
    </section>
  );
}
