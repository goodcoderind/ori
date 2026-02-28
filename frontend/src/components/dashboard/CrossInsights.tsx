import type { DashboardSummary, SessionListItem } from '../../types/api';
import { Card } from '../ui/Card';
import { formatPeakRange } from '../../utils/formatters';

interface CrossInsightsProps {
  summary: DashboardSummary;
  sessions: SessionListItem[];
}

export function CrossInsights({ summary, sessions }: CrossInsightsProps) {
  const techniques = Object.entries(summary.technique_success_rates);
  const [topTechniqueName] =
    techniques.sort((a, b) => b[1] - a[1])[0] ?? ['your current favourite move', 0];

  const masteryEntries = Object.entries(summary.mastery_by_topic);
  const blindSpotTopic =
    masteryEntries.sort((a, b) => a[1] - b[1])[0]?.[0] ?? 'areas you touch less often';

  const heat = summary.focus_heatmap;
  const peakLabel = (Object.entries(heat).sort((a, b) => b[1] - a[1])[0]?.[0] ??
    'night') as 'morning' | 'afternoon' | 'night';
  const peakRange = formatPeakRange(peakLabel);

  const avgDuration =
    sessions.reduce((acc, s) => acc + s.duration_minutes, 0) /
    (sessions.length || 1);

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

