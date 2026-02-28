import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import type { DashboardSummary, SessionListItem } from '../../types/api';
import { formatPercent, formatRelative, formatTechniqueId } from '../../utils/formatters';

interface TopicMindmapProps {
  summary: DashboardSummary;
  sessions: SessionListItem[];
}

function slugifyTopic(name: string): string {
  return encodeURIComponent(name);
}

interface TopicInsight {
  technique: string;
  notWorking: string;
  workOn: string;
}

function calculateTopicInsights(
  topic: string,
  summary: DashboardSummary,
  sessions: SessionListItem[]
): TopicInsight {
  const topicSessions = sessions.filter((s) => s.topic_label === topic);
  const masteryEntry = summary.mastery_by_topic[topic];
  const mastery = masteryEntry?.p_mastery || 0;

  // Find best technique for this topic (from array)
  const bestTechnique = summary.technique_success_rates.length > 0
    ? formatTechniqueId(summary.technique_success_rates.sort((a, b) => b.success_rate - a.success_rate)[0].technique_id)
    : 'Active Recall';

  // What's not working - based on session patterns
  // Since we don't have dominant_state, use confidence and microassess scores
  const lowConfidenceCount = topicSessions.filter((s) => s.avg_confidence !== null && s.avg_confidence < 0.6).length;
  const lowScoreCount = topicSessions.filter((s) => s.avg_microassess_score !== null && s.avg_microassess_score < 0.5).length;
  
  let notWorking = 'Long sessions';
  if (lowConfidenceCount > topicSessions.length * 0.4) {
    notWorking = 'Rushing through concepts';
  } else if (lowScoreCount > topicSessions.length * 0.3) {
    notWorking = 'Skipping fundamentals';
  } else if (topicSessions.length > 0 && topicSessions.reduce((acc, s) => acc + s.duration_seconds, 0) / topicSessions.length > 3600) {
    notWorking = 'Too much at once';
  }

  // What to work on
  let workOn = 'Practice problems';
  if (mastery < 0.4) {
    workOn = 'Build foundations';
  } else if (mastery < 0.6) {
    workOn = 'Connect concepts';
  } else {
    workOn = 'Deepen understanding';
  }

  return {
    technique: bestTechnique,
    notWorking,
    workOn,
  };
}

export function TopicMindmap({ summary, sessions }: TopicMindmapProps) {
  const topics = Object.entries(summary.mastery_by_topic);

  const container = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: 0.1 },
    },
  };

  const item = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0 },
  };

  return (
    <section id="topics" className="space-y-4">
      <div className="flex items-end justify-between">
        <div>
          <div className="text-xs font-medium uppercase tracking-[0.16em] text-textMuted">
            Topics
          </div>
          <div className="mt-1 font-serifDisplay text-lg italic text-textPrimary">
            Your learning landscape
          </div>
        </div>
      </div>

      <motion.div
        className="grid grid-cols-1 gap-6 lg:grid-cols-2"
        variants={container}
        initial="hidden"
        animate="visible"
      >
        {topics.map(([topicName, masteryEntry]) => {
          const insights = calculateTopicInsights(topicName, summary, sessions);
          const mastery = masteryEntry.p_mastery;
          const slug = slugifyTopic(topicName);

          return (
            <motion.div key={topicName} variants={item}>
              <Link to={`/dashboard/topic/${slug}`}>
                <div className="group relative glass rounded-2xl p-6 transition-all hover:border-accentViolet/40 glass-hover">
                  {/* Topic header */}
                  <div className="mb-4 flex items-center justify-between">
                    <h3 className="font-medium text-textPrimary">{topicName.replace('/', ' / ')}</h3>
                    <div className="font-monoData text-lg font-medium text-textPrimary">
                      {formatPercent(mastery)}
                    </div>
                  </div>

                  {/* Mastery progress bar */}
                  <div className="mb-6">
                    <div className="h-2 w-full overflow-hidden rounded-full glass-strong">
                      <motion.div
                        className="h-full bg-gradient-to-r from-accentViolet to-accentMint"
                        initial={{ width: 0 }}
                        animate={{ width: `${mastery * 100}%` }}
                        transition={{ duration: 1, ease: 'easeOut' }}
                      />
                    </div>
                  </div>

                  {/* Insights */}
                  <div className="space-y-3">
                    {/* Technique that helps */}
                    <div className="rounded-lg glass border border-accentViolet/30 bg-accentViolet/10 p-3">
                      <div className="mb-1 text-[10px] font-medium uppercase tracking-wider text-textFaint">
                        Technique that helps
                      </div>
                      <div className="text-sm text-textPrimary">{insights.technique}</div>
                    </div>

                    {/* What's not working */}
                    <div 
                      className="rounded-lg glass border p-3"
                      style={{
                        borderColor: 'rgba(224, 96, 96, 0.3)',
                        backgroundColor: 'rgba(224, 96, 96, 0.1)',
                      }}
                    >
                      <div className="mb-1 text-[10px] font-medium uppercase tracking-wider text-textFaint">
                        What&apos;s not working
                      </div>
                      <div className="text-sm text-textPrimary">{insights.notWorking}</div>
                    </div>

                    {/* What you can work on */}
                    <div className="rounded-lg glass border border-accentAmber/30 bg-accentAmber/10 p-3">
                      <div className="mb-1 text-[10px] font-medium uppercase tracking-wider text-textFaint">
                        What you can work on
                      </div>
                      <div className="text-sm text-textPrimary">{insights.workOn}</div>
                    </div>
                  </div>

                  {/* Review info */}
                  {(masteryEntry.last_probe_at || masteryEntry.next_probe_at) && (
                    <div className="mt-4 border-t border-white/10 pt-3 text-xs text-textMuted">
                      {masteryEntry.last_probe_at && (
                        <div>Last reviewed {formatRelative(masteryEntry.last_probe_at)}</div>
                      )}
                      {masteryEntry.next_probe_at && (
                        <div>Next review {formatRelative(masteryEntry.next_probe_at)}</div>
                      )}
                    </div>
                  )}
                </div>
              </Link>
            </motion.div>
          );
        })}
      </motion.div>
    </section>
  );
}
