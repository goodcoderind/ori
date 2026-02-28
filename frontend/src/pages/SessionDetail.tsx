import { Link, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useSession } from '../hooks/useSession';
import { useDashboard } from '../hooks/useDashboard';
import { Spinner } from '../components/ui/Spinner';
import { ErrorCard } from '../components/ui/ErrorCard';
import { Badge } from '../components/ui/Badge';
import { StateTimeline } from '../components/session/StateTimeline';
import { SuggestionLog } from '../components/session/SuggestionLog';
import { AssessmentLog } from '../components/session/AssessmentLog';
import { formatDuration, formatPercent } from '../utils/formatters';
import { stateColors } from '../utils/stateColors';
import type { LearnerState } from '../types/states';

function computeDominantState(byState: Partial<Record<LearnerState, number>>): LearnerState | null {
  if (!byState || Object.keys(byState).length === 0) return null;
  const entries = Object.entries(byState) as Array<[LearnerState, number]>;
  const [state] = entries.sort((a, b) => b[1] - a[1])[0];
  return state;
}

export function SessionDetail() {
  const { id } = useParams<{ id: string }>();
  const { session, loading, error, refetch } = useSession(id);
  const { sessions } = useDashboard();

  if (error) {
    return (
      <ErrorCard
        message={error}
        onRetry={refetch}
      />
    );
  }

  if (loading || !session) {
    return <Spinner />;
  }

  const dominant = computeDominantState(session.rolled_up_summary.by_state) ?? 'FLOW';
  const index = sessions.findIndex((s) => s.session_id === session.session_id);
  const prev = index > 0 ? sessions[index - 1] : null;
  const next = index >= 0 && index < sessions.length - 1 ? sessions[index + 1] : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6 }}
      className="space-y-6"
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-1">
          <Link
            to="/dashboard"
            className="text-xs text-textMuted hover:text-textPrimary"
          >
            ← Back to dashboard
          </Link>
          <div className="text-xs text-textMuted">
            {session.topic_label}
          </div>
          <div className="font-serifDisplay text-xl italic text-textPrimary">
            Session {session.session_id}
          </div>
          <div className="text-xs text-textFaint">
            {new Date(session.started_at).toLocaleString('en-US', {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
              hour: 'numeric',
              minute: '2-digit',
            })}
            {' · '}
            {formatDuration(session.duration_seconds)}
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="flex items-center gap-2 text-xs">
            <span className="text-textFaint">Dominant state</span>
            <Badge variant={dominant}>
              {dominant.replace('_', ' ')}
            </Badge>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <div className="glass rounded-xl p-4">
          <div className="text-xs text-textMuted">Nudges</div>
          <div className="mt-1 font-monoData text-lg font-medium text-textPrimary">
            {session.n_nudges}
          </div>
        </div>
        {session.avg_confidence !== null && (
          <div className="glass rounded-xl p-4">
            <div className="text-xs text-textMuted">Avg Confidence</div>
            <div className="mt-1 font-monoData text-lg font-medium text-textPrimary">
              {formatPercent(session.avg_confidence)}
            </div>
          </div>
        )}
        {session.avg_microassess_score !== null && (
          <div className="glass rounded-xl p-4">
            <div className="text-xs text-textMuted">Micro-assess</div>
            <div className="mt-1 font-monoData text-lg font-medium text-textPrimary">
              {formatPercent(session.avg_microassess_score)}
            </div>
          </div>
        )}
        <div className="glass rounded-xl p-4">
          <div className="text-xs text-textMuted">Total Events</div>
          <div className="mt-1 font-monoData text-lg font-medium text-textPrimary">
            {session.rolled_up_summary.total_events}
          </div>
        </div>
      </div>

      {/* Rolled-up Summary */}
      <div className="glass rounded-2xl p-6">
        <div className="mb-4 text-xs font-medium uppercase tracking-[0.16em] text-textMuted">
          Summary
        </div>
        <div className="flex items-center gap-4">
          <div className="text-sm text-textMuted">
            Suggestions shown: <span className="font-monoData text-textPrimary">{session.rolled_up_summary.suggestions_shown}</span>
        </div>
        <div className="flex items-center gap-2">
            {Object.entries(session.rolled_up_summary.by_state).map(([state, count]) => (
              <div key={state} className="flex items-center gap-1.5">
                <div
                className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: stateColors[state as LearnerState] }}
              />
                <span className="text-xs text-textMuted">
                  {state.replace('_', ' ')}: {count}
              </span>
              </div>
          ))}
          </div>
        </div>
      </div>

      {/* Event Timeline */}
      <StateTimeline session={session} />

      {/* Assessment Log */}
      <AssessmentLog session={session} />

      {/* Suggestion Log */}
      <SuggestionLog session={session} />

      {/* Navigation */}
      <div className="flex items-center justify-between border-t border-white/10 pt-6">
        {prev ? (
            <Link
              to={`/dashboard/session/${prev.session_id}`}
            className="text-sm text-accentViolet hover:underline"
            >
              ← Previous session
            </Link>
        ) : (
          <div />
          )}
          {next && (
            <Link
              to={`/dashboard/session/${next.session_id}`}
            className="text-sm text-accentViolet hover:underline"
            >
              Next session →
            </Link>
          )}
      </div>
    </motion.div>
  );
}
