import type { SessionDetail } from '../../types/api';
import { Card } from '../ui/Card';

interface InsightBurstProps {
  session: SessionDetail;
}

export function InsightBurst({ session }: InsightBurstProps) {
  if (!session.insight_moments) return null;

  const cards = Array.from({ length: session.insight_moments }).map((_, idx) => ({
    id: idx,
  }));

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2 text-xs text-textMuted">
        <span className="text-base">✨</span>
        <span>
          {session.insight_moments} insight
          {session.insight_moments > 1 ? ' moments noticed in this session.' : ' moment noticed in this session.'}
        </span>
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {cards.map((card) => (
          <Card
            key={card.id}
            hoverable
            accentColor="#F0A55A"
            className="space-y-2 bg-accentAmber/5"
          >
            <div className="text-xs font-medium uppercase tracking-[0.16em] text-accentAmber">
              Insight {card.id + 1}
            </div>
            <p className="text-xs text-textPrimary">
              Your attention shifted quickly from uncertainty into a clearer mental model.
              Capture what clicked here while it&apos;s still warm.
            </p>
          </Card>
        ))}
      </div>
    </section>
  );
}

