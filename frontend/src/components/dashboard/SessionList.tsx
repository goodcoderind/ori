import { Link } from 'react-router-dom';
import type { SessionListItem } from '../../types/api';
import { Card } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { formatDurationMinutes, formatRelativeTime } from '../../utils/formatters';
import { stateColors } from '../../utils/stateColors';

interface SessionListProps {
  sessions: SessionListItem[];
}

export function SessionList({ sessions }: SessionListProps) {
  if (!sessions.length) {
    return (
      <section id="sessions">
        <Card>
          <div className="text-sm text-textMuted">
            No sessions yet. Start a study session with the DeepIt extension to see
            your learning history here.
          </div>
        </Card>
      </section>
    );
  }

  // Mock insight counts and flow % - in real app, this would come from session detail
  const getSessionInsights = (sessionId: string) => {
    const mockInsights: Record<string, number> = {
      sess_001: 3,
      sess_002: 1,
      sess_003: 0,
      sess_004: 2,
      sess_005: 1,
      sess_006: 4,
      sess_007: 0,
      sess_008: 0,
      sess_009: 2,
    };
    return mockInsights[sessionId] || 0;
  };

  const getFlowPercent = (session: SessionListItem) => {
    // Mock flow % - in real app, calculate from state timeline
    return session.dominant_state === 'FLOW' ? 0.54 : session.dominant_state === 'INSIGHT' ? 0.48 : 0.32;
  };

  return (
    <section id="sessions" className="space-y-3">
      <div className="flex items-end justify-between">
        <div>
          <div className="text-xs font-medium uppercase tracking-[0.16em] text-textMuted">
            Session Feed
          </div>
          <div className="mt-1 font-serifDisplay text-lg italic text-textPrimary">
            Your recent learning
          </div>
        </div>
      </div>

      <Card>
        <div className="max-h-96 space-y-1 overflow-y-auto">
          {sessions.slice(0, 10).map((session) => {
            const insights = getSessionInsights(session.session_id);
            const flowPercent = getFlowPercent(session);
            
            return (
              <Link
                to={`/dashboard/session/${session.session_id}`}
                key={session.session_id}
              >
                <div className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-xs transition-all hover:glass hover:shadow-lg">
                  {/* State color dot */}
                  <div
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: stateColors[session.dominant_state] }}
                  />
                  
                  {/* Topic badge */}
                  <div className="w-28 shrink-0">
                    <Badge variant={session.dominant_state}>
                      {session.topic_label}
                    </Badge>
                  </div>
                  
                  {/* Title */}
                  <div className="flex-1 truncate text-textPrimary">
                    {session.title.length > 40 
                      ? `${session.title.substring(0, 40)}...` 
                      : session.title}
                  </div>
                  
                  {/* Duration */}
                  <div className="w-20 shrink-0 font-monoData text-[11px] text-textMuted text-right">
                    {formatDurationMinutes(session.duration_minutes)}
                  </div>
                  
                  {/* Flow % bar */}
                  <div className="w-16 shrink-0">
                    <div className="h-1.5 w-full overflow-hidden rounded-full glass-strong">
                      <div
                        className="h-full bg-gradient-to-r from-accentViolet to-accentMint"
                        style={{ width: `${flowPercent * 100}%` }}
                      />
                    </div>
                  </div>
                  
                  {/* Insight count */}
                  {insights > 0 && (
                    <div className="flex items-center gap-1 text-accentAmber">
                      <span className="text-xs">✨</span>
                      <span className="font-monoData text-[11px]">{insights}</span>
                    </div>
                  )}
                  
                  {/* Timestamp */}
                  <div className="w-24 shrink-0 text-[11px] text-right text-textFaint">
                    {formatRelativeTime(session.started_at)}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
        {sessions.length > 10 && (
          <div className="mt-3 border-t border-white/10 pt-3 text-center">
            <Link
              to="/dashboard#sessions"
              className="text-xs text-accentViolet hover:text-accentViolet/80"
            >
              View all sessions →
            </Link>
          </div>
        )}
      </Card>
    </section>
  );
}

