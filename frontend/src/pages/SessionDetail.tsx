import { Link, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useSession } from '../hooks/useSession';
import { useDashboard } from '../hooks/useDashboard';
import { Spinner } from '../components/ui/Spinner';
import { ErrorCard } from '../components/ui/ErrorCard';
import { StateTimeline } from '../components/session/StateTimeline';
import { SuggestionLog } from '../components/session/SuggestionLog';
import { AssessmentLog } from '../components/session/AssessmentLog';
import { formatDuration, formatPercent, formatRelative } from '../utils/formatters';
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
      <div className="flex h-full items-center justify-center">
      <ErrorCard
        message={error}
        onRetry={refetch}
      />
      </div>
    );
  }

  if (loading || !session) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner />
      </div>
    );
  }

  const dominant = computeDominantState(session.rolled_up_summary.by_state) ?? 'FLOW';
  const index = sessions.findIndex((s) => s.session_id === session.session_id);
  const prev = index > 0 ? sessions[index - 1] : null;
  const next = index >= 0 && index < sessions.length - 1 ? sessions[index + 1] : null;

  return (
    <div className="h-full overflow-y-auto">
      {/* Max-width container to prevent horizontal stretching */}
      <div className="mx-auto max-w-[1280px] px-8 py-8">
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6 }}
          className="space-y-8"
    >
          {/* Header Section */}
          <div className="flex items-start justify-between gap-6">
            <div className="max-w-[720px] space-y-3">
          <Link
            to="/dashboard"
                className="inline-flex items-center gap-2 text-sm text-textMuted transition-colors hover:text-textPrimary"
          >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M10 12 L6 8 L10 4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Back to dashboard
          </Link>
              
              <div>
                <div className="mb-1 text-sm font-medium uppercase tracking-[0.16em] text-textMuted">
            {session.topic_label}
          </div>
                <div className="mb-2 font-serifDisplay text-3xl italic text-textPrimary">
                  Session {session.session_id}
                </div>
                <div className="flex items-center gap-3 text-sm text-textFaint">
                  <span>{new Date(session.started_at).toLocaleString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit',
                  })}</span>
                  <span>·</span>
                  <span className="font-monoData">{formatDuration(session.duration_seconds)}</span>
          </div>
          </div>
        </div>

            {/* Dominant State Badge */}
        <div className="flex flex-col items-end gap-2">
              <div className="text-xs font-medium uppercase tracking-[0.16em] text-textMuted">
                Dominant state
              </div>
              <div
                className="rounded-full px-4 py-2 text-sm font-medium text-textPrimary"
                style={{
                  backgroundColor: `${stateColors[dominant]}20`,
                  border: `1px solid ${stateColors[dominant]}40`,
                  color: stateColors[dominant],
                }}
              >
              {dominant.replace('_', ' ')}
              </div>
            </div>
          </div>

          {/* Stats Grid - 2x2 instead of 4 columns */}
          <div className="grid grid-cols-2 gap-4">
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="bento-cell bento-cell-indigo p-5"
            >
              <div className="mb-2 text-xs font-medium uppercase tracking-[0.16em] text-textMuted">
                Nudges
              </div>
              <div className="font-monoData text-3xl font-light text-textPrimary">
                {session.n_nudges}
              </div>
            </motion.div>

            {session.avg_confidence !== null && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 }}
                className="bento-cell bento-cell-teal p-5"
              >
                <div className="mb-2 text-xs font-medium uppercase tracking-[0.16em] text-textMuted">
                  Avg Confidence
                </div>
                <div className="font-monoData text-3xl font-light text-textPrimary">
                  {formatPercent(session.avg_confidence)}
                </div>
              </motion.div>
            )}

            {session.avg_microassess_score !== null && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="bento-cell bento-cell-blue p-5"
              >
                <div className="mb-2 text-xs font-medium uppercase tracking-[0.16em] text-textMuted">
                  Micro-assess
                </div>
                <div className="font-monoData text-3xl font-light text-textPrimary">
                  {formatPercent(session.avg_microassess_score)}
                </div>
              </motion.div>
            )}

            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.25 }}
              className="bento-cell bento-cell-purple p-5"
          >
              <div className="mb-2 text-xs font-medium uppercase tracking-[0.16em] text-textMuted">
                Total Events
              </div>
              <div className="font-monoData text-3xl font-light text-textPrimary">
                {session.rolled_up_summary.total_events}
        </div>
            </motion.div>
      </div>

          {/* Summary and Timeline - 2 Column Layout */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* Summary Section - Left */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="bento-cell bento-cell-mint p-6"
            >
              <div className="mb-4 text-sm font-medium uppercase tracking-[0.16em] text-textMuted">
                Summary
              </div>
              <div className="space-y-4">
                <div className="text-sm text-textPrimary">
                  Suggestions shown: <span className="font-monoData font-medium">{session.rolled_up_summary.suggestions_shown}</span>
        </div>
                <div className="flex flex-col gap-3">
                  {Object.entries(session.rolled_up_summary.by_state).map(([state, count]) => (
                    <div key={state} className="flex items-center gap-2">
                      <div
                        className="h-3 w-3 rounded-full"
                        style={{ backgroundColor: stateColors[state as LearnerState] }}
              />
                      <span className="text-sm font-medium text-textPrimary">
                        {state.replace('_', ' ')}: <span className="font-monoData">{count}</span>
              </span>
                    </div>
          ))}
        </div>
      </div>
            </motion.div>

            {/* Event Timeline - Right */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.35 }}
            >
              <StateTimeline session={session} />
            </motion.div>
          </div>

          {/* Assessment Log - Constrained width */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="mx-auto max-w-[720px]"
          >
            <AssessmentLog session={session} />
          </motion.div>

          {/* Suggestion Log - Constrained width */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6 }}
            className="mx-auto max-w-[720px]"
          >
            <SuggestionLog session={session} />
          </motion.div>

          {/* Navigation */}
          <div className="flex items-center justify-between border-t border-white/10 pt-6">
            {prev ? (
            <Link
              to={`/dashboard/session/${prev.session_id}`}
                className="flex items-center gap-2 rounded-lg glass border border-white/10 px-4 py-2 text-sm font-medium text-textPrimary transition-all hover:border-white/20 hover:shadow-lg"
            >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M10 12 L6 8 L10 4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Previous session
            </Link>
            ) : (
              <div />
          )}
          {next && (
            <Link
              to={`/dashboard/session/${next.session_id}`}
                className="flex items-center gap-2 rounded-lg glass border border-white/10 px-4 py-2 text-sm font-medium text-textPrimary transition-all hover:border-white/20 hover:shadow-lg"
            >
                Next session
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M6 4 L10 8 L6 12" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
            </Link>
          )}
        </div>
        </motion.div>
      </div>
    </div>
  );
}
