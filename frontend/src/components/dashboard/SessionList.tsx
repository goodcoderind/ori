import { Link } from 'react-router-dom';
import type { SessionListItem } from '../../types/api';
import { Card } from '../ui/Card';
import { formatDuration, formatRelative, formatPercent } from '../../utils/formatters';

interface SessionListProps {
  sessions: SessionListItem[];
}

// Generate a consistent color for a topic label
function getTopicColor(topic: string): string {
  const colors = ['#7C6EF5', '#52C99A', '#F0A55A', '#5BA3F5', '#E06060', '#C06EE0'];
  let hash = 0;
  for (let i = 0; i < topic.length; i++) {
    hash = topic.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

export function SessionList({ sessions }: SessionListProps) {
  return (
    <div className="w-full h-full flex flex-col">
      <div className="flex-shrink-0 mb-3">
        <div className="text-sm font-medium uppercase tracking-[0.16em] text-textMuted">
            Session Feed
          </div>
        <div className="mt-0.5 font-serifDisplay text-lg italic text-textPrimary">
            Your recent learning
        </div>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0">
        <div className="space-y-1">
          {sessions.slice(0, 10).map((session) => {
            const topicColor = getTopicColor(session.topic_label);
            
            return (
              <Link
                to={`/dashboard/session/${session.session_id}`}
                key={session.session_id}
              >
                <div className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-xs transition-all hover:glass hover:shadow-lg">
                  {/* Topic color dot */}
                  <div
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: topicColor }}
                  />
                  
                  {/* Topic label */}
                  <div className="w-32 shrink-0">
                    <div 
                      className="rounded-full px-2 py-0.5 text-[10px] font-medium"
                      style={{ 
                        backgroundColor: `${topicColor}20`,
                        color: topicColor,
                      }}
                    >
                      {session.topic_label}
                  </div>
                  </div>
                  
                  {/* Duration */}
                  <div className="w-20 shrink-0 font-monoData text-[11px] text-textMuted">
                    {formatDuration(session.duration_seconds)}
                  </div>
                  
                  {/* Confidence */}
                  {session.avg_confidence !== null && (
                    <div className="w-16 shrink-0 text-right">
                      <div className="font-monoData text-[11px] text-textPrimary">
                        {formatPercent(session.avg_confidence)}
                    </div>
                      <div className="text-[9px] text-textFaint">confidence</div>
                    </div>
                  )}
                  
                  {/* Nudges */}
                  <div className="w-12 shrink-0 text-right text-textMuted">
                    {session.n_nudges} nudge{session.n_nudges !== 1 ? 's' : ''}
                  </div>
                  
                  {/* Timestamp */}
                  <div className="flex-1 text-right font-monoData text-[10px] text-textFaint">
                    {formatRelative(session.started_at)}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
        
        {sessions.length === 0 && (
          <div className="py-8 text-center">
            <div className="mb-2 text-2xl">📚</div>
            <div className="text-sm font-medium text-textPrimary">No sessions yet.</div>
            <div className="mt-1 text-xs text-textMuted">Start learning to see your sessions here.</div>
          </div>
        )}
      </div>
    </div>
  );
}
