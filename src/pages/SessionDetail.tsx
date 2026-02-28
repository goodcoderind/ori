import { Link, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useSession } from '../hooks/useSession';
import { useDashboard } from '../hooks/useDashboard';
import { Spinner } from '../components/ui/Spinner';
import { ErrorCard } from '../components/ui/ErrorCard';
import { Badge } from '../components/ui/Badge';
import { StateTimeline } from '../components/session/StateTimeline';
import { SuggestionLog } from '../components/session/SuggestionLog';
import { InsightBurst } from '../components/session/InsightBurst';
import { formatDurationMinutes } from '../utils/formatters';
import { stateColors } from '../utils/stateColors';
import type { LearnerState } from '../types/states';

function computeDominantState(states: Array<{ state: LearnerState; confidence: number }>): LearnerState | null {
  if (!states.length) return null;
  const byState = new Map<LearnerState, number>();
  states.forEach((s) => {
    byState.set(s.state, (byState.get(s.state) ?? 0) + s.confidence);
  });
  let best: LearnerState | null = null;
  let bestScore = -Infinity;
  byState.forEach((score, state) => {
    if (score > bestScore) {
      bestScore = score;
      best = state;
    }
  });
  return best;
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

  const dominant =
    computeDominantState(session.state_timeline) ??
    sessions.find((s) => s.session_id === session.session_id)?.dominant_state ??
    'FLOW';

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
            {session.title}
          </div>
          <div className="text-xs text-textFaint">
            {new Date(session.started_at).toLocaleString()} ·{' '}
            {formatDurationMinutes(session.duration_minutes)}
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="flex items-center gap-2 text-xs">
            <span className="text-textFaint">Dominant state</span>
            <Badge variant={dominant}>
              {dominant.replace('_', ' ')}
            </Badge>
          </div>
          <a
            href={session.url}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-accentBlue hover:underline"
          >
            Open context
          </a>
        </div>
      </div>

      <StateTimeline session={session} />

      <SuggestionLog session={session} />

      <InsightBurst session={session} />

      <div className="mt-4 flex items-center justify-between text-xs text-textMuted">
        <div className="flex items-center gap-3">
          <span className="h-1 w-6 rounded-full bg-borderSubtle" />
          <span>Each dot is coloured by state and sized by confidence.</span>
        </div>
        <div className="flex items-center gap-2">
          {(['FLOW', 'CONFUSION', 'INSIGHT'] as LearnerState[]).map((state) => (
            <span key={state} className="flex items-center gap-1">
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: stateColors[state] }}
              />
              <span className="text-[11px] uppercase tracking-[0.16em] text-textFaint">
                {state}
              </span>
            </span>
          ))}
        </div>
      </div>

      <div className="mt-6 flex items-center justify-between text-xs text-textFaint">
        <div className="flex gap-2">
          {prev && (
            <Link
              to={`/dashboard/session/${prev.session_id}`}
              className="rounded-full border border-borderSubtle px-3 py-1 hover:border-accentViolet hover:text-textPrimary"
            >
              ← Previous session
            </Link>
          )}
        </div>
        <div className="flex gap-2">
          {next && (
            <Link
              to={`/dashboard/session/${next.session_id}`}
              className="rounded-full border border-borderSubtle px-3 py-1 hover:border-accentViolet hover:text-textPrimary"
            >
              Next session →
            </Link>
          )}
        </div>
      </div>
    </motion.div>
  );
}

