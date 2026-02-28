import { motion } from 'framer-motion';
import { useDashboard } from '../hooks/useDashboard';
import { Spinner } from '../components/ui/Spinner';
import { ErrorCard } from '../components/ui/ErrorCard';
import { generateWeeklyNarrative } from '../utils/generateWeeklyNarrative';

export function WeeklyReview() {
  const { summary, sessions, loading, error, refetch } = useDashboard();

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

  if (!summary) {
    return null;
  }

  const narrative = generateWeeklyNarrative(summary, sessions);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6 }}
      className="mx-auto max-w-3xl space-y-8"
    >
      {/* Header */}
      <div className="space-y-2 border-b border-borderSubtle pb-6">
        <div className="font-serifDisplay text-3xl italic text-textPrimary">
          Week of {narrative.weekRange}
        </div>
        <div className="text-sm text-textMuted">
          A narrative digest of your past 7 days
        </div>
      </div>

      {/* The Numbers */}
      <section className="space-y-3">
        <div className="font-serifDisplay text-xl italic text-textPrimary">
          The Numbers
        </div>
        <div className="space-y-2 text-sm leading-relaxed text-textPrimary">
          <p>
            {narrative.numbers.sessions} sessions · {narrative.numbers.hours.toFixed(1)} hours ·{' '}
            {Math.round(narrative.numbers.avgFlow * 100)}% average flow ratio
          </p>
          <p className="text-textMuted">
            {narrative.numbers.vsLastWeek.sessions >= 0 ? '+' : ''}
            {narrative.numbers.vsLastWeek.sessions} sessions vs last week ·{' '}
            {narrative.numbers.vsLastWeek.hours >= 0 ? '+' : ''}
            {narrative.numbers.vsLastWeek.hours.toFixed(1)}h vs last week
          </p>
        </div>
        {narrative.bestSession && (
          <div className="text-sm text-textMuted">
            Your best session: {narrative.bestSession.day}, {narrative.bestSession.time} ·{' '}
            {narrative.bestSession.topic} · {Math.round(narrative.bestSession.flow * 100)}% flow
          </div>
        )}
        {narrative.hardestSession && (
          <div className="text-sm text-textMuted">
            Your hardest session: {narrative.hardestSession.day}, {narrative.hardestSession.time} ·{' '}
            {narrative.hardestSession.topic} · {Math.round(narrative.hardestSession.flow * 100)}% flow
          </div>
        )}
      </section>

      {/* What Worked */}
      {narrative.whatWorked && (
        <section className="space-y-3">
          <div className="font-serifDisplay text-xl italic text-textPrimary">
            What Worked
          </div>
          <p className="text-sm leading-relaxed text-textPrimary">
            {narrative.whatWorked.message}
          </p>
        </section>
      )}

      {/* What Didn't */}
      {narrative.whatDidnt && (
        <section className="space-y-3">
          <div className="font-serifDisplay text-xl italic text-textPrimary">
            What Didn&apos;t
          </div>
          <p className="text-sm leading-relaxed text-textPrimary">
            {narrative.whatDidnt.message}
          </p>
        </section>
      )}

      {/* A Pattern We Noticed */}
      {narrative.pattern && (
        <section className="space-y-3">
          <div className="font-serifDisplay text-xl italic text-textPrimary">
            A Pattern We Noticed
          </div>
          <p className="text-sm leading-relaxed text-textPrimary">
            {narrative.pattern.message}
          </p>
        </section>
      )}

      {/* Insight Moments */}
      {narrative.insights.length > 0 && (
        <section className="space-y-3">
          <div className="font-serifDisplay text-xl italic text-textPrimary">
            This Week&apos;s Insight Moments ({narrative.insights.length})
          </div>
          <div className="space-y-2">
            {narrative.insights.map((insight, idx) => (
              <div key={idx} className="flex items-start gap-2 text-sm text-textPrimary">
                <span className="text-accentAmber">✨</span>
                <span>
                  <span className="font-medium">{insight.day}</span> · {insight.topic} · {insight.description}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Next Week */}
      <section className="space-y-3 border-t border-borderSubtle pt-6">
        <div className="font-serifDisplay text-xl italic text-textPrimary">
          Next Week
        </div>
        <div className="space-y-2 text-sm leading-relaxed text-textPrimary">
          {narrative.nextWeek.reviewsDue > 0 && (
            <p>
              {narrative.nextWeek.reviewsDue} reviews due:{' '}
              {summary.upcoming_reviews
                .slice(0, 3)
                .map((r) => {
                  const dueDate = new Date(r.next_probe_at);
                  const now = Date.now();
                  const hoursUntil = (dueDate.getTime() - now) / (1000 * 60 * 60);
                  if (hoursUntil < 0) return `${r.topic_label} (overdue)`;
                  if (hoursUntil < 24) return `${r.topic_label} (today)`;
                  if (hoursUntil < 48) return `${r.topic_label} (tomorrow)`;
                  return `${r.topic_label} (in ${Math.round(hoursUntil / 24)} days)`;
                })
                .join(', ')}
              .
            </p>
          )}
          {narrative.nextWeek.recommendations.map((rec, idx) => (
            <p key={idx} className="text-textMuted">
              Recommendation: {rec}
            </p>
          ))}
        </div>
      </section>
    </motion.div>
  );
}
