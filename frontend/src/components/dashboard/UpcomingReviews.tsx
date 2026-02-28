import type { DashboardSummary } from '../../types/api';
import { Card } from '../ui/Card';
import { formatDueTime, formatPercent } from '../../utils/formatters';

interface UpcomingReviewsProps {
  summary: DashboardSummary;
}

export function UpcomingReviews({ summary }: UpcomingReviewsProps) {
  // Sort by next_probe_at, overdue items first
  const sorted = [...summary.upcoming_reviews].sort((a, b) => {
    if (a.overdue && !b.overdue) return -1;
    if (!a.overdue && b.overdue) return 1;
    return new Date(a.next_probe_at).getTime() - new Date(b.next_probe_at).getTime();
  });

  return (
    <section id="reviews" className="space-y-3">
      <div className="flex items-end justify-between">
        <div>
          <div className="text-sm font-medium uppercase tracking-[0.16em] text-textMuted">
            Upcoming reviews
          </div>
          <div className="mt-1 font-serifDisplay text-xl italic text-textPrimary">
            Keeping ideas from fading
          </div>
        </div>
      </div>

      <div className="w-full">
        {sorted.length === 0 ? (
          <div className="py-8 text-center">
            <div className="mb-2 text-2xl">✓</div>
            <div className="text-sm font-medium text-textPrimary">All caught up.</div>
            <div className="mt-1 text-xs text-textMuted">No reviews due right now.</div>
          </div>
        ) : (
          <div className="space-y-2 text-sm">
            {sorted.map((review) => {
              let urgencyColor = 'text-textFaint';
              if (review.overdue) {
                urgencyColor = 'text-textMuted';
              } else {
                const hoursUntil = (new Date(review.next_probe_at).getTime() - Date.now()) / (1000 * 60 * 60);
                if (hoursUntil < 24) urgencyColor = 'text-textMuted';
                else if (hoursUntil < 48) urgencyColor = 'text-textFaint';
              }

              return (
                <div
                  key={`${review.topic_label}-${review.next_probe_at}`}
                  className="flex items-center justify-between gap-4 rounded-lg px-3 py-2.5 text-xs transition-all hover:glass hover:shadow-lg"
                >
                  <div className="flex items-center gap-3 flex-1">
                    {review.overdue && (
                      <div className="h-2 w-2 rounded-full bg-white/40" />
                    )}
                  <div className="flex-1">
                      <div className="mb-1 font-medium text-textPrimary">{review.topic_label}</div>
                    <div className={`text-[10px] font-medium ${urgencyColor}`}>
                        {review.overdue ? 'OVERDUE' : formatDueTime(review.next_probe_at, review.overdue)}
                      </div>
                    </div>
                  </div>
                  <div className="font-monoData text-[11px] text-textMuted">
                    {formatPercent(review.p_mastery)} mastery
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
