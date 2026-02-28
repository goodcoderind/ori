import { motion } from 'framer-motion';
import type { DashboardSummary, SessionListItem } from '../../types/api';
import { formatPeriod, formatTechniqueId } from '../../utils/formatters';

interface LearnerDNAProps {
  summary: DashboardSummary;
  sessions: SessionListItem[];
}

export function LearnerDNA({ summary, sessions }: LearnerDNAProps) {
  // Top technique from real API data
  const sortedTechniques = [...summary.technique_success_rates].sort((a, b) => b.success_rate - a.success_rate);
  const topTechnique = sortedTechniques[0];
  const topTechniqueName = topTechnique ? formatTechniqueId(topTechnique.technique_id) : 'None yet';

  // Weakest topic from mastery data
  const masteryEntries = Object.entries(summary.mastery_by_topic);
  const weakestTopic = masteryEntries.length > 0
    ? [...masteryEntries].sort((a, b) => a[1].p_mastery - b[1].p_mastery)[0]
    : null;
  const blindSpotLabel = weakestTopic
    ? `${weakestTopic[0]} (${Math.round(weakestTopic[1].p_mastery * 100)}% mastery)`
    : 'Not enough data yet';

  // Peak time from heatmap
  const heat = summary.focus_heatmap;
  const peakEntry = Object.entries(heat).sort((a, b) => b[1] - a[1])[0];
  const peakLabel = (peakEntry?.[0] ?? 'night') as 'morning' | 'afternoon' | 'evening' | 'night';
  const peakRange = formatPeriod(peakLabel);
  const peakScore = peakEntry ? `${Math.round(peakEntry[1] * 100)}% focus` : '';

  // Session duration stats
  const avgDuration = sessions.length > 0
    ? sessions.reduce((acc, s) => acc + s.duration_seconds, 0) / sessions.length / 60
    : 0;

  // Determine archetype from session patterns
  const flowSessions = sessions.filter((s) => s.avg_confidence !== null && s.avg_confidence > 0.7);
  const avgFlowDuration = flowSessions.length > 0
    ? flowSessions.reduce((acc, s) => acc + s.duration_seconds, 0) / flowSessions.length / 60
    : 0;

  const archetype = avgDuration > 45 && avgFlowDuration > 40
    ? { name: 'Deep Diver', description: 'You go slow, go deep, and emerge with real understanding. You need 15+ minutes before you hit flow. Once you\'re in, you\'re in.' }
    : avgDuration < 30
    ? { name: 'Sprint Learner', description: 'You learn in focused bursts. Short, intense sessions work best for you. You prefer variety and quick wins.' }
    : { name: 'Steady Builder', description: 'You maintain consistent learning rhythms. You build knowledge gradually, session by session, with reliable progress.' };

  return (
    <section className="mb-12">
      <div className="flex items-end justify-between mb-4">
        <div>
          <div className="text-sm font-medium uppercase tracking-[0.16em] text-textMuted">
            Learner DNA
          </div>
          <div className="mt-1 font-serifDisplay text-xl italic text-textPrimary">
            Who you are as a learner
          </div>
        </div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="relative overflow-hidden glass rounded-2xl border-l-4 border-white/20 p-10"
      >
        <div className="mb-6">
          <div className="mb-2 text-xs font-medium uppercase tracking-[0.16em] text-textMuted">
            YOUR LEARNER DNA
          </div>
          <div className="h-px w-24 bg-borderSubtle" />
        </div>

        <div className="mb-8">
          <div className="mb-3 font-serifDisplay text-4xl italic text-textPrimary">
            You are a {archetype.name}
          </div>
          <div className="max-w-2xl text-sm leading-relaxed text-textMuted">
            {archetype.description}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="rounded-lg glass border border-white/12 bg-white/5 p-4">
            <div className="mb-2 flex items-center gap-2 text-xs font-medium text-textMuted uppercase tracking-wider">
              <span>⚡</span>
              <span>TOP TECHNIQUE</span>
            </div>
            <div className="text-sm font-medium text-textPrimary">
              {topTechniqueName}
              {topTechnique && <span className="ml-2 text-xs text-textMuted">{Math.round(topTechnique.success_rate * 100)}% success</span>}
            </div>
          </div>

          <div className="rounded-lg glass border border-white/10 bg-white/3 p-4">
            <div className="mb-2 flex items-center gap-2 text-xs font-medium text-textMuted uppercase tracking-wider">
              <span>🕳</span>
              <span>WEAKEST TOPIC</span>
            </div>
            <div className="text-sm font-medium text-textPrimary">{blindSpotLabel}</div>
          </div>

          <div className="rounded-lg glass border border-white/12 bg-white/5 p-4">
            <div className="mb-2 flex items-center gap-2 text-xs font-medium text-textMuted uppercase tracking-wider">
              <span>🕐</span>
              <span>PEAK TIME</span>
            </div>
            <div className="text-sm font-medium text-textPrimary">
              {peakRange} · {peakScore}
            </div>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-4 border-t border-borderSubtle pt-6 md:grid-cols-2">
          <div>
            <div className="text-xs text-textFaint">Total sessions:</div>
            <div className="text-sm text-textPrimary">{sessions.length}</div>
          </div>
          <div>
            <div className="text-xs text-textFaint">Avg session length:</div>
            <div className="text-sm text-textPrimary">{Math.round(avgDuration)} min</div>
          </div>
        </div>
      </motion.div>
    </section>
  );
}
