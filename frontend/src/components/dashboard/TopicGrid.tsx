import { Link } from 'react-router-dom';
import type { DashboardSummary, SessionListItem } from '../../types/api';
import { Card } from '../ui/Card';
import { ProgressBar } from '../ui/ProgressBar';

interface TopicGridProps {
  summary: DashboardSummary;
  sessions: SessionListItem[];
}

function slugifyTopic(name: string): string {
  return encodeURIComponent(name);
}

export function TopicGrid({ summary, sessions }: TopicGridProps) {
  const topics = Object.entries(summary.mastery_by_topic);

  const topicPatterns: Record<string, string[]> = {};
  topics.forEach(([topic, masteryEntry]) => {
    const topicSessions = sessions.filter((s) => s.topic_label === topic);
    const avgDuration =
      topicSessions.reduce((acc, s) => acc + s.duration_seconds, 0) /
      (topicSessions.length || 1) / 60;
    // Estimate flow by confidence (sessions don't have dominant_state)
    const hasFlow = topicSessions.some((s) => s.avg_confidence !== null && s.avg_confidence > 0.7);

    const patterns: string[] = [];
    if (avgDuration > 45) patterns.push('Gets stuck after ~40min');
    if (hasFlow) patterns.push('Flow is common here');
    if (patterns.length === 0) patterns.push('Still learning this pattern');
    patterns.unshift('Visual learner here');

    topicPatterns[topic] = patterns.slice(0, 3);
  });

  return (
    <section id="topics" className="space-y-3">
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

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {topics.map(([topic, masteryEntry]) => {
          const mastery = masteryEntry.p_mastery;
          return (
          <Link
            key={topic}
            to={`/dashboard/topic/${slugifyTopic(topic)}`}
          >
            <Card hoverable className="h-full">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="text-sm font-medium text-textPrimary">
                  {topic}
                </div>
                <div className="text-xs font-monoData text-textMuted">
                  {Math.round(mastery * 100)}% mastery
                </div>
              </div>
              <div className="mb-4">
                <ProgressBar value={mastery} height={6} />
              </div>
              <div className="flex flex-wrap gap-2">
                {topicPatterns[topic].map((pattern) => (
                  <span
                    key={pattern}
                      className="rounded-full glass px-2 py-1 text-[11px] text-textMuted"
                  >
                    {pattern}
                  </span>
                ))}
              </div>
            </Card>
          </Link>
          );
        })}
      </div>
    </section>
  );
}
