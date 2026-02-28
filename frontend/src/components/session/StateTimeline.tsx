import type { SessionDetail } from '../../types/api';
import { stateColors } from '../../utils/stateColors';
import { Card } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { formatPercent } from '../../utils/formatters';

interface StateTimelineProps {
  session: SessionDetail;
}

export function StateTimeline({ session }: StateTimelineProps) {
  const points = session.event_timeline;
  if (!points.length) {
    return null;
  }

  const start = new Date(points[0].ts).getTime();
  const end = new Date(points[points.length - 1].ts).getTime();
  const span = Math.max(end - start, 1);

  return (
    <Card hoverable className="space-y-4">
      <div>
        <div className="text-xs font-medium uppercase tracking-[0.16em] text-textMuted">
          Event Timeline
        </div>
        <div className="mt-1 font-serifDisplay text-lg italic text-textPrimary">
          How your attention moved through the session
        </div>
      </div>

      <div className="overflow-x-auto pb-2">
        <div className="relative h-32 min-w-[600px]">
          {/* Connecting line */}
          <div className="absolute inset-y-0 left-0 right-0 top-1/2 -translate-y-1/2 border-t border-white/10" />
          
          {points.map((point, idx) => {
            const t = new Date(point.ts).getTime();
            const x = ((t - start) / span) * 100;
            const size = 12 + point.confidence * 8;
            const prevPoint = idx > 0 ? points[idx - 1] : null;
            const lineColor = prevPoint ? stateColors[prevPoint.state_label] : stateColors[point.state_label];

            return (
              <div
                key={`${point.ts}-${idx}`}
                className="absolute -translate-x-1/2"
                style={{ left: `${x}%`, top: '50%' }}
              >
                {/* Connecting line from previous point */}
                {prevPoint && (
                  <div
                    className="absolute -translate-y-1/2"
                    style={{
                      left: `${((new Date(prevPoint.ts).getTime() - start) / span) * 100}%`,
                      width: `${x - ((new Date(prevPoint.ts).getTime() - start) / span) * 100}%`,
                      height: '2px',
                      backgroundColor: lineColor,
                      opacity: 0.4,
                      top: '50%',
                    }}
                  />
                )}
                
                {/* Point container */}
                <div className="relative flex flex-col items-center">
                  {/* Ori state label above */}
                  <div className="mb-1 text-[9px] text-textFaint">
                    {point.ori_state.replace('_', ' ')}
                  </div>
                  
                  {/* Suggestion badge if present */}
                  {point.suggestion_type !== 'NONE' && (
                    <div className="mb-1">
                      <Badge variant="neutral">
                        {point.suggestion_type.replace('_', ' ')}
                      </Badge>
                    </div>
                  )}
                  
                  {/* State dot */}
                  <div
                    className="relative cursor-default rounded-full transition-transform hover:scale-125"
                    style={{
                      width: `${size}px`,
                      height: `${size}px`,
                      backgroundColor: stateColors[point.state_label],
                      boxShadow: `0 0 8px ${stateColors[point.state_label]}40`,
                    }}
                    title={`${point.state_label} · ${formatPercent(point.confidence)} confidence at ${new Date(point.ts).toLocaleTimeString()}`}
                  />
                  
                  {/* State label below */}
                  <div className="mt-1 text-[10px] font-medium text-textPrimary">
                    {point.state_label.replace('_', ' ')}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </Card>
  );
}
