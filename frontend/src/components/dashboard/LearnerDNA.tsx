import { motion } from 'framer-motion';
import type { DashboardSummary, SessionListItem } from '../../types/api';
import { formatPeriod, formatTechniqueId } from '../../utils/formatters';

interface LearnerDNAProps {
  summary: DashboardSummary;
  sessions: SessionListItem[];
}

export function LearnerDNA({ summary, sessions }: LearnerDNAProps) {
  // Calculate learner archetype and insights
  // technique_success_rates is now an ARRAY
  const topTechnique = summary.technique_success_rates.length > 0
    ? summary.technique_success_rates.sort((a, b) => b.success_rate - a.success_rate)[0]
    : null;
  const topTechniqueName = topTechnique ? formatTechniqueId(topTechnique.technique_id) : 'your current favourite move';

  const masteryEntries = Object.entries(summary.mastery_by_topic);
  const blindSpotTopic = masteryEntries.sort((a, b) => a[1].p_mastery - b[1].p_mastery)[0]?.[0] ?? 'areas you touch less often';

  const heat = summary.focus_heatmap;
  const peakLabel = (Object.entries(heat).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'night') as 'morning' | 'afternoon' | 'evening' | 'night';
  const peakRange = formatPeriod(peakLabel);

  // Convert duration_seconds to minutes
  const avgDuration = sessions.reduce((acc, s) => acc + s.duration_seconds, 0) / (sessions.length || 1) / 60;
  // Since sessions don't have dominant_state, estimate flow sessions by confidence
  const flowSessions = sessions.filter((s) => s.avg_confidence !== null && s.avg_confidence > 0.7);
  const avgFlowDuration = flowSessions.reduce((acc, s) => acc + s.duration_seconds, 0) / (flowSessions.length || 1) / 60;

  // Determine archetype
  const archetype = avgDuration > 45 && avgFlowDuration > 40 
    ? { name: 'Deep Diver', description: 'You go slow, go deep, and emerge with real understanding. You need 15+ minutes before you hit flow. Once you\'re in, you\'re in.' }
    : avgDuration < 30
    ? { name: 'Sprint Learner', description: 'You learn in focused bursts. Short, intense sessions work best for you. You prefer variety and quick wins.' }
    : { name: 'Steady Builder', description: 'You maintain consistent learning rhythms. You build knowledge gradually, session by session, with reliable progress.' };

  const superpower = 'Making analogies';
  const blindSpot = 'Overconfidence when tired';
  const peakSpeed = '67% faster';

  return (
    <section className="mb-12">
      <div className="flex items-end justify-between mb-4">
        <div>
          <div className="text-xs font-medium uppercase tracking-[0.16em] text-textMuted">
            Learner DNA
          </div>
          <div className="mt-1 font-serifDisplay text-lg italic text-textPrimary">
            Who you are as a learner
          </div>
        </div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="relative overflow-hidden glass rounded-2xl border-l-4 border-accentAmber p-8"
        style={{
          backgroundImage: `radial-gradient(circle at 20% 50%, rgba(240, 165, 90, 0.03) 0%, transparent 50%)`,
        }}
      >
        <div className="mb-6">
          <div className="mb-2 text-xs font-medium uppercase tracking-[0.16em] text-textMuted">
            YOUR LEARNER DNA
          </div>
          <div className="h-px w-24 bg-borderSubtle" />
        </div>

        <div className="mb-8">
          <div className="mb-3 font-serifDisplay text-4xl italic text-accentAmber">
            You are a {archetype.name}
          </div>
          <div className="max-w-2xl text-sm leading-relaxed text-textMuted">
            {archetype.description}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="rounded-lg glass border border-accentAmber/30 bg-accentAmber/10 p-4">
            <div className="mb-2 flex items-center gap-2 text-xs font-medium text-accentAmber">
              <span>⚡</span>
              <span>SUPERPOWER</span>
            </div>
            <div className="text-sm font-medium text-textPrimary">{superpower}</div>
          </div>

          <div className="rounded-lg glass border border-accentViolet/30 bg-accentViolet/10 p-4">
            <div className="mb-2 flex items-center gap-2 text-xs font-medium text-accentViolet">
              <span>🕳</span>
              <span>BLIND SPOT</span>
            </div>
            <div className="text-sm font-medium text-textPrimary">{blindSpot}</div>
          </div>

          <div className="rounded-lg glass border border-accentMint/30 bg-accentMint/10 p-4">
            <div className="mb-2 flex items-center gap-2 text-xs font-medium text-accentMint">
              <span>🕐</span>
              <span>PEAK TIME</span>
            </div>
            <div className="text-sm font-medium text-textPrimary">
              {peakRange} · {peakSpeed}
            </div>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-4 border-t border-borderSubtle pt-6 md:grid-cols-2">
          <div>
            <div className="text-xs text-textFaint">Preferred modality:</div>
            <div className="text-sm text-textPrimary">Visual + conceptual</div>
          </div>
          <div>
            <div className="text-xs text-textFaint">Avg focus before break needed:</div>
            <div className="text-sm text-textPrimary">{Math.round(avgDuration)} min</div>
          </div>
        </div>
      </motion.div>
    </section>
  );
}
