import type { SessionDetail } from '../../types/api';
import { stateColors } from '../../utils/stateColors';
import { Card } from '../ui/Card';

interface StateTimelineProps {
  session: SessionDetail;
}

export function StateTimeline({ session }: StateTimelineProps) {
  const points = session.state_timeline;
  if (!points.length) {
    return null;
  }

  const start = new Date(points[0].timestamp).getTime();
  const end = new Date(points[points.length - 1].timestamp).getTime();
  const span = Math.max(end - start, 1);

  const uniqueStates = Array.from(new Set(points.map((p) => p.state)));

  return (
    <Card hoverable className="space-y-4">
      <div>
        <div className="text-xs font-medium uppercase tracking-[0.16em] text-textMuted">
          State timeline
        </div>
        <div className="mt-1 font-serifDisplay text-lg italic text-textPrimary">
          How your attention moved through the session
        </div>
      </div>

      <div className="overflow-x-auto pb-2">
        <div className="relative h-24 min-w-[480px]">
          <div className="absolute inset-y-1/2 left-0 right-0 -translate-y-1/2 border-t border-borderSubtle" />
          {points.map((point) => {
            const t = new Date(point.timestamp).getTime();
            const x = ((t - start) / span) * 100;
            const size = 10 + point.confidence * 10;

            return (
              <div
                key={point.timestamp}
                className="absolute -translate-x-1/2"
                style={{ left: `${x}%`, top: '50%' }}
              >
                <div
                  className="relative cursor-default"
                  title={`${point.state} · ${Math.round(
                    point.confidence * 100,
                  )}% at ${new Date(point.timestamp).toLocaleTimeString()}`}
                >
                  <div
                    className="rounded-full border border-background"
                    style={{
                      width: size,
                      height: size,
                      backgroundColor: stateColors[point.state],
                      boxShadow: `0 0 0 3px ${stateColors[point.state]}33`,
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 text-[11px] text-textMuted">
        {uniqueStates.map((state) => (
          <div key={state} className="flex items-center gap-1.5">
            <span
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: stateColors[state] }}
            />
            <span className="uppercase tracking-[0.16em] text-textFaint">
              {state.replace('_', ' ')}
            </span>
          </div>
        ))}
      </div>
    </Card>
  );
}

