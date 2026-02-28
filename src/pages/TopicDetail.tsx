import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useDashboard } from '../hooks/useDashboard';
import { Spinner } from '../components/ui/Spinner';
import { ErrorCard } from '../components/ui/ErrorCard';
import { EmptyState } from '../components/ui/EmptyState';
import { Card } from '../components/ui/Card';
import { ProgressBar } from '../components/ui/ProgressBar';
import { SessionList } from '../components/dashboard/SessionList';
import { TechniqueTable } from '../components/dashboard/TechniqueTable';

function slugifyTopic(name: string): string {
  return name.toLowerCase().replace(/\s+/g, '-');
}

export function TopicDetail() {
  const { slug } = useParams<{ slug: string }>();
  const { summary, sessions, loading, error, refetch } = useDashboard();

  const topicName = useMemo(() => {
    if (!summary || !slug) return null;
    const entry = Object.keys(summary.mastery_by_topic).find(
      (topic) => slugifyTopic(topic) === slug,
    );
    return entry ?? null;
  }, [summary, slug]);

  const topicSessions = useMemo(
    () => (topicName ? sessions.filter((s) => s.topic_label === topicName) : []),
    [sessions, topicName],
  );

  if (error) {
    return (
      <ErrorCard
        message={error}
        onRetry={refetch}
      />
    );
  }

  if (loading && !summary) {
    return <Spinner />;
  }

  if (!summary || !topicName) {
    return (
      <EmptyState
        title="This topic doesn&apos;t exist yet."
        description="Once you spend time learning a topic, DeepIt will start tracing patterns specific to it."
      />
    );
  }

  const mastery = summary.mastery_by_topic[topicName] ?? 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6 }}
      className="space-y-8"
    >
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-1">
          <Link
            to="/dashboard"
            className="text-xs text-textMuted hover:text-textPrimary"
          >
            ← Back to dashboard
          </Link>
          <div className="font-serifDisplay text-2xl italic text-textPrimary">
            {topicName}
          </div>
          <div className="text-xs text-textFaint">
            How you tend to learn when this topic is on the table.
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        <Card className="flex flex-col items-center justify-center gap-4 md:col-span-1">
          <div className="relative h-32 w-32">
            <svg viewBox="0 0 120 120" className="h-full w-full">
              <circle
                cx="60"
                cy="60"
                r="46"
                stroke="#26263A"
                strokeWidth="8"
                fill="none"
              />
              <motion.circle
                cx="60"
                cy="60"
                r="46"
                stroke="#7C6EF5"
                strokeWidth="8"
                fill="none"
                strokeDasharray={`${2 * Math.PI * 46} ${2 * Math.PI * 46}`}
                strokeDashoffset={2 * Math.PI * 46 * 0.25}
                strokeLinecap="round"
                transform="rotate(-90 60 60)"
                initial={{ strokeDashoffset: 2 * Math.PI * 46 * 0.75 }}
                animate={{ 
                  strokeDashoffset: 2 * Math.PI * 46 * (0.75 - Math.max(mastery, 0.02))
                }}
                transition={{ duration: 1.2, ease: 'easeOut' }}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-xs uppercase tracking-[0.18em] text-textFaint">
                Mastery
              </span>
              <motion.span
                className="font-monoData text-xl text-textPrimary"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.3, duration: 0.5 }}
              >
                {Math.round(mastery * 100)}%
              </motion.span>
            </div>
          </div>
          <div className="text-xs text-textMuted text-center max-w-xs">
            This is DeepIt&apos;s current guess at how reliably you can work with
            this topic without sliding into re-learning.
          </div>
        </Card>

        <div className="md:col-span-2 space-y-4">
          <Card className="space-y-3">
            <div className="text-xs font-medium uppercase tracking-[0.16em] text-textMuted">
              How you learn here
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3 text-xs">
              <div className="space-y-1">
                <div className="text-[11px] uppercase tracking-[0.18em] text-textFaint">
                  Pacing
                </div>
                <p className="text-textPrimary">
                  Sessions on this topic tend to run{' '}
                  <span className="font-monoData">
                    {Math.round(
                      topicSessions.reduce((acc, s) => acc + s.duration_minutes, 0) /
                        (topicSessions.length || 1),
                    )}{' '}
                    min
                  </span>
                  , suggesting a preferred unit of focus.
                </p>
              </div>
              <div className="space-y-1">
                <div className="text-[11px] uppercase tracking-[0.18em] text-textFaint">
                  Stickiness
                </div>
                <p className="text-textPrimary">
                  You revisit this topic{' '}
                  <span className="font-monoData">{topicSessions.length}</span> times in
                  the observed window, which shapes your spaced repetition.
                </p>
              </div>
              <div className="space-y-1">
                <div className="text-[11px] uppercase tracking-[0.18em] text-textFaint">
                  Texture
                </div>
                <p className="text-textPrimary">
                  Expect some turbulence here—DeepIt will surface where confusion clusters
                  so you can lean on your best techniques sooner.
                </p>
              </div>
            </div>
          </Card>

          <div>
            <SessionList sessions={topicSessions} />
          </div>
        </div>
      </div>

      <div>
        <TechniqueTable summary={summary} />
      </div>
    </motion.div>
  );
}

