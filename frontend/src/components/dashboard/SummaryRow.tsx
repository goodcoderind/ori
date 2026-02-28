import { motion } from 'framer-motion';
import type { DashboardSummary, SessionListItem } from '../../types/api';
import { StatCard } from '../ui/StatCard';
import { formatPeriod, formatTechniqueId, formatPercent } from '../../utils/formatters';

interface SummaryRowProps {
  summary: DashboardSummary;
  sessions: SessionListItem[];
}

function computePeakFocus(summary: DashboardSummary): string {
  const entries = Object.entries(summary.focus_heatmap) as Array<
    ['morning' | 'afternoon' | 'evening' | 'night', number]
  >;
  const [label] = entries.sort((a, b) => b[1] - a[1])[0];
  return formatPeriod(label);
}

function computeTopTechnique(summary: DashboardSummary): [string, number] {
  // technique_success_rates is now an ARRAY
  if (!summary.technique_success_rates.length) return ['—', 0];
  const top = [...summary.technique_success_rates].sort((a, b) => b.success_rate - a.success_rate)[0];
  return [formatTechniqueId(top.technique_id), top.success_rate];
}

function computeWeekDelta(sessions: SessionListItem[]): string {
  const now = Date.now();
  const weekMs = 7 * 24 * 60 * 60 * 1000;
  const weekCount = sessions.filter(
    (s) => now - new Date(s.started_at).getTime() <= weekMs,
  ).length;
  return `${weekCount} this week`;
}

export function SummaryRow({ summary, sessions }: SummaryRowProps) {
  const totalSessions = sessions.length;
  const peakFocus = computePeakFocus(summary);
  const [topTechnique, topTechniqueValue] = computeTopTechnique(summary);

  const container = {
    hidden: { opacity: 0, y: 12 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { staggerChildren: 0.08, delayChildren: 0.05 },
    },
  };

  const item = {
    hidden: { opacity: 0, y: 12 },
    visible: { opacity: 1, y: 0 },
  };

  return (
    <motion.div
      className="grid grid-cols-1 gap-4 md:grid-cols-3"
      variants={container}
      initial="hidden"
      animate="visible"
    >
      <motion.div variants={item}>
        <StatCard
          label="Total sessions"
          value={totalSessions}
          delta={computeWeekDelta(sessions)}
          accentColor="#7C6EF5"
        />
      </motion.div>
      <motion.div variants={item}>
        <StatCard
          label="Peak focus time"
          value={peakFocus}
          accentColor="#52C99A"
        />
      </motion.div>
      <motion.div variants={item}>
        <StatCard
          label="Top technique"
          value={`${topTechniqueValue ? `${formatPercent(topTechniqueValue)} · ` : ''}${topTechnique}`}
          accentColor="#F0A55A"
        />
      </motion.div>
    </motion.div>
  );
}
