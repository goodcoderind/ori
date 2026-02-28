import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import type { DashboardSummary, SessionListItem } from '../../types/api';

interface TopicMindmapProps {
  summary: DashboardSummary;
  sessions: SessionListItem[];
}

function slugifyTopic(name: string): string {
  return name.toLowerCase().replace(/\s+/g, '-');
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
  const mastery = summary.mastery_by_topic[topic] || 0;

  // Find best technique for this topic
  const techniqueSuccess = summary.technique_success_rates;
  const bestTechnique = Object.entries(techniqueSuccess)
    .sort(([, a], [, b]) => b - a)[0]?.[0] || 'Active Recall';

  // What's not working - based on dominant states
  const frustrationCount = topicSessions.filter((s) => s.dominant_state === 'FRUSTRATION').length;
  const confusionCount = topicSessions.filter((s) => s.dominant_state === 'CONFUSION').length;
  const overloadCount = topicSessions.filter((s) => s.dominant_state === 'OVERLOAD').length;
  
  let notWorking = 'Long sessions';
  if (frustrationCount > topicSessions.length * 0.3) {
    notWorking = 'Rushing through concepts';
  } else if (confusionCount > topicSessions.length * 0.4) {
    notWorking = 'Skipping fundamentals';
  } else if (overloadCount > topicSessions.length * 0.3) {
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
    <section id="topics" className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <div className="text-xs font-medium uppercase tracking-[0.16em] text-textMuted">
            Topics
          </div>
          <div className="mt-1 font-serifDisplay text-lg italic text-textPrimary">
            How you learn across subjects
          </div>
        </div>
      </div>

      <motion.div
        variants={container}
        initial="hidden"
        animate="visible"
        className="grid grid-cols-1 gap-6 md:grid-cols-2"
      >
        {topics.map(([topic, mastery], index) => {
          const insights = calculateTopicInsights(topic, summary, sessions);
          
          return (
            <motion.div key={topic} variants={item}>
              <Link to={`/dashboard/topic/${slugifyTopic(topic)}`}>
                <div className="group relative glass rounded-2xl p-6 transition-all hover:border-accentViolet/40 glass-hover">
                  {/* Topic Header */}
                  <div className="mb-4 flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <h3 className="mb-1 text-base font-medium text-textPrimary">
                        {topic}
                      </h3>
                      <div className="flex items-center gap-3">
                        <span className="text-xs font-monoData text-textMuted">
                          {Math.round(mastery * 100)}% mastery
                        </span>
                        <div className="h-1.5 flex-1 max-w-[120px] overflow-hidden rounded-full bg-surfaceRaised">
                          <motion.div
                            className="h-full bg-gradient-to-r from-accentViolet to-accentMint"
                            initial={{ width: 0 }}
                            animate={{ width: `${mastery * 100}%` }}
                            transition={{ delay: 0.2 + index * 0.1, duration: 0.8 }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Insights Grid */}
                  <div className="space-y-3">
                    {/* Technique that helps */}
                    <div className="rounded-lg glass border border-accentViolet/30 bg-accentViolet/10 p-3">
                      <div className="mb-1 flex items-center gap-1.5 text-xs font-medium text-accentViolet">
                        <span>✨</span>
                        <span>Which study technique helps</span>
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
                      <div 
                        className="mb-1 flex items-center gap-1.5 text-xs font-medium"
                        style={{ color: '#E06060' }}
                      >
                        <span>⚠️</span>
                        <span>What&apos;s not working</span>
                      </div>
                      <div className="text-sm text-textPrimary">{insights.notWorking}</div>
                    </div>

                    {/* What to work on */}
                    <div className="rounded-lg glass border border-accentAmber/30 bg-accentAmber/10 p-3">
                      <div className="mb-1 flex items-center gap-1.5 text-xs font-medium text-accentAmber">
                        <span>🎯</span>
                        <span>What you can work on</span>
                      </div>
                      <div className="text-sm text-textPrimary">{insights.workOn}</div>
                    </div>
                  </div>
                </div>
              </Link>
            </motion.div>
          );
        })}
      </motion.div>
    </section>
  );
}
