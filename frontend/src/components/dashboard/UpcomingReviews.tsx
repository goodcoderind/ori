import type { DashboardSummary } from '../../types/api';
import { Card } from '../ui/Card';
import { formatRelativeTime } from '../../utils/formatters';

interface UpcomingReviewsProps {
  summary: DashboardSummary;
}

export function UpcomingReviews({ summary }: UpcomingReviewsProps) {
  const now = Date.now();

  return (
    <section id="reviews" className="space-y-3">
      <div className="flex items-end justify-between">
        <div>
          <div className="text-xs font-medium uppercase tracking-[0.16em] text-textMuted">
            Upcoming reviews
          </div>
          <div className="mt-1 font-serifDisplay text-lg italic text-textPrimary">
            Keeping ideas from fading
          </div>
        </div>
      </div>

      <Card>
        {summary.upcoming_reviews.length === 0 ? (
          <div className="py-8 text-center">
            <div className="mb-2 text-2xl">✓</div>
            <div className="text-sm font-medium text-textPrimary">All caught up.</div>
            <div className="mt-1 text-xs text-textMuted">No reviews due right now.</div>
          </div>
        ) : (
          <div className="space-y-2 text-sm">
            {summary.upcoming_reviews.map((review) => {
              const dueTime = new Date(review.due_at).getTime();
              const overdue = dueTime < now;
              const hoursUntil = (dueTime - now) / (1000 * 60 * 60);
              const isToday = hoursUntil >= 0 && hoursUntil < 24;
              const isSoon = hoursUntil >= 24 && hoursUntil < 48;

              let urgency: 'OVERDUE' | 'TODAY' | 'SOON' | 'LATER' = 'LATER';
              let urgencyColor = 'text-textFaint';
              if (overdue) {
                urgency = 'OVERDUE';
                urgencyColor = 'text-accentRed';
              } else if (isToday) {
                urgency = 'TODAY';
                urgencyColor = 'text-accentAmber';
              } else if (isSoon) {
                urgency = 'SOON';
                urgencyColor = 'text-accentBlue';
              }

              return (
                <div
                  key={`${review.topic}-${review.due_at}`}
                  className="flex items-center justify-between gap-4 rounded-lg px-3 py-2.5 text-xs transition-all hover:glass hover:shadow-lg"
                >
                  <div className="flex-1">
                    <div className="mb-1 font-medium text-textPrimary">{review.topic}</div>
                    <div className={`text-[10px] font-medium ${urgencyColor}`}>
                      {urgency}
                    </div>
                  </div>
                  <div className="font-monoData text-[11px] text-textMuted">
                    {overdue 
                      ? `overdue by ${Math.abs(Math.round(hoursUntil))}h`
                      : isToday
                      ? `due in ${Math.round(hoursUntil)}h`
                      : hoursUntil < 48
                      ? 'due tomorrow'
                      : formatRelativeTime(review.due_at)}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </section>
  );
}

