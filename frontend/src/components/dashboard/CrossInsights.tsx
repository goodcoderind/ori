import type { DashboardSummary, SessionListItem } from '../../types/api';
import { Card } from '../ui/Card';
import { formatPeriod, formatTechniqueId } from '../../utils/formatters';

interface CrossInsightsProps {
  summary: DashboardSummary;
  sessions: SessionListItem[];
}

export function CrossInsights({ summary, sessions }: CrossInsightsProps) {
  // technique_success_rates is now an ARRAY
  const topTechnique = summary.technique_success_rates.length > 0
    ? summary.technique_success_rates.sort((a, b) => b.success_rate - a.success_rate)[0]
    : null;
  const topTechniqueName = topTechnique ? formatTechniqueId(topTechnique.technique_id) : 'your current favourite move';

  const masteryEntries = Object.entries(summary.mastery_by_topic);
  const blindSpotTopic =
    masteryEntries.sort((a, b) => a[1].p_mastery - b[1].p_mastery)[0]?.[0] ?? 'areas you touch less often';

  const heat = summary.focus_heatmap;
  const peakLabel = (Object.entries(heat).sort((a, b) => b[1] - a[1])[0]?.[0] ??
    'night') as 'morning' | 'afternoon' | 'evening' | 'night';
  const peakRange = formatPeriod(peakLabel);

  // Convert duration_seconds to minutes
  const avgDuration =
    sessions.reduce((acc, s) => acc + s.duration_seconds, 0) /
    (sessions.length || 1) / 60;

  return (
    <section className="space-y-3">
      <div className="flex items-end justify-between">
        <div>
          <div className="text-xs font-medium uppercase tracking-[0.16em] text-textMuted">
            Cross-subject insights
          </div>
          <div className="mt-1 font-serifDisplay text-lg italic text-textPrimary">
            The patterns that travel with you
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card
          hoverable
          accentColor="#F0A55A"
          className="space-y-2"
        >
          <div className="text-xs font-medium uppercase tracking-[0.16em] text-accentAmber">
            Your superpower
          </div>
          <div className="text-sm text-textPrimary">
            You lean on <span className="font-medium">{topTechniqueName}</span> to
            turn confusion into traction.
          </div>
          <p className="text-xs text-textMuted">
            When you remember to bring this technique in early, your sessions stay
            calmer and more directed.
          </p>
        </Card>

        <Card
          hoverable
          accentColor="#7C6EF5"
          className="space-y-2"
        >
          <div className="text-xs font-medium uppercase tracking-[0.16em] text-accentViolet">
            Your blind spot
          </div>
          <div className="text-sm text-textPrimary">
            <span className="font-medium">{blindSpotTopic}</span> tends to slip
            just out of focus.
          </div>
          <p className="text-xs text-textMuted">
            These sessions often run longer than planned and drift into review
            instead of deliberate practice.
          </p>
        </Card>

        <Card
          hoverable
          accentColor="#52C99A"
          className="space-y-2"
        >
          <div className="text-xs font-medium uppercase tracking-[0.16em] text-accentMint">
            Peak focus
          </div>
          <div className="text-sm text-textPrimary">
            {peakRange}{' '}
            <span className="text-textMuted">· sessions average</span>{' '}
            <span className="font-monoData">
              {Math.round(avgDuration)} min
            </span>
          </div>
          <p className="text-xs text-textMuted">
            This is when your mind is most willing to sit with difficulty. Protect
            this window for the work that matters.
          </p>
        </Card>
      </div>
    </section>
  );
}

