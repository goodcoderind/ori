import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useDashboard } from '../hooks/useDashboard';
import { Spinner } from '../components/ui/Spinner';
import { ErrorCard } from '../components/ui/ErrorCard';
import { Card } from '../components/ui/Card';
import { ProgressBar } from '../components/ui/ProgressBar';
import { formatTechniqueId } from '../utils/formatters';

interface TechniqueDetail {
  description: string;
  triggerCondition: string;
  bestContext: string;
  worstContext: string;
  perTopicRates: Record<string, number>;
  successOverTime: Array<{ date: string; success: boolean }>;
  globalAverage: number;
}

// Mock technique details - in real app, this would come from API
const techniqueDetails: Record<string, TechniqueDetail> = {
  'Feynman Explanation': {
    description: 'Explain the concept as if teaching it to someone else. This forces you to identify gaps in your understanding.',
    triggerCondition: 'When confused on text for >5min',
    bestContext: 'Works best for you on conceptual, text-heavy topics',
    worstContext: 'Less effective on procedural/step-by-step content',
    perTopicRates: {
      'Machine Learning': 0.85,
      'Calculus': 0.78,
      'World History': 0.72,
      'Organic Chemistry': 0.65,
    },
    successOverTime: [
      { date: '2024-01-15', success: true },
      { date: '2024-01-18', success: true },
      { date: '2024-01-20', success: false },
      { date: '2024-01-22', success: true },
    ],
    globalAverage: 0.68,
  },
  'Modality Switching': {
    description: 'Switch between visual, auditory, or kinesthetic learning modes to reinforce understanding.',
    triggerCondition: 'When stuck in one learning mode for >10min',
    bestContext: 'Effective when you need to break out of a rut',
    worstContext: 'Can be distracting if overused',
    perTopicRates: {
      'Machine Learning': 0.70,
      'Calculus': 0.75,
      'World History': 0.80,
      'Organic Chemistry': 0.68,
    },
    successOverTime: [
      { date: '2024-01-16', success: true },
      { date: '2024-01-19', success: true },
      { date: '2024-01-21', success: true },
    ],
    globalAverage: 0.72,
  },
  'Active Recall': {
    description: 'Test yourself on the material without looking at notes or sources.',
    triggerCondition: 'After reading/watching for >15min',
    bestContext: 'Best for memorization-heavy topics',
    worstContext: 'Less useful for pure understanding tasks',
    perTopicRates: {
      'Machine Learning': 0.65,
      'Calculus': 0.72,
      'World History': 0.78,
      'Organic Chemistry': 0.60,
    },
    successOverTime: [
      { date: '2024-01-17', success: true },
      { date: '2024-01-19', success: false },
      { date: '2024-01-21', success: true },
    ],
    globalAverage: 0.65,
  },
  'Elaborative Interrogation': {
    description: 'Ask yourself "why" and "how" questions about the material to deepen understanding.',
    triggerCondition: 'When surface-level understanding detected',
    bestContext: 'Great for connecting concepts',
    worstContext: 'Can slow you down on time-sensitive tasks',
    perTopicRates: {
      'Machine Learning': 0.58,
      'Calculus': 0.65,
      'World History': 0.70,
      'Organic Chemistry': 0.55,
    },
    successOverTime: [
      { date: '2024-01-18', success: true },
      { date: '2024-01-20', success: true },
    ],
    globalAverage: 0.61,
  },
  Pomodoro: {
    description: 'Work in focused 25-minute intervals with short breaks to maintain concentration.',
    triggerCondition: 'When session duration >45min without break',
    bestContext: 'Excellent for maintaining focus over long sessions',
    worstContext: 'Can interrupt deep flow states',
    perTopicRates: {
      'Machine Learning': 0.90,
      'Calculus': 0.85,
      'World History': 0.88,
      'Organic Chemistry': 0.82,
    },
    successOverTime: [
      { date: '2024-01-15', success: true },
      { date: '2024-01-16', success: true },
      { date: '2024-01-17', success: true },
      { date: '2024-01-18', success: true },
    ],
    globalAverage: 0.75,
  },
};

const techniqueUsage: Record<string, { count: number; trend: number }> = {
  'Feynman Explanation': { count: 24, trend: 5 },
  'Modality Switching': { count: 18, trend: 8 },
  'Active Recall': { count: 12, trend: -3 },
  'Elaborative Interrogation': { count: 9, trend: 2 },
  Pomodoro: { count: 31, trend: 0 },
};

export function Techniques() {
  const { summary, loading, error, refetch } = useDashboard();
  const [expanded, setExpanded] = useState<string | null>(null);

  if (error) {
    return (
      <ErrorCard
        message={error}
        onRetry={refetch}
      />
    );
  }

  if (loading && !summary) {
    return <Spinner />;
  }

  if (!summary) {
    return null;
  }

  // technique_success_rates is now an ARRAY
  const entries = [...summary.technique_success_rates].sort(
    (a, b) => b.success_rate - a.success_rate,
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6 }}
      className="space-y-6"
    >
      <div className="space-y-2">
        <div className="font-serifDisplay text-3xl italic text-textPrimary">
          What works for you.
        </div>
        <div className="text-sm text-textMuted">
          DeepIt has observed how you respond to {entries.length} techniques across{' '}
          {entries[0]?.shown_count || 0}+ sessions.
        </div>
      </div>

      <div className="space-y-3">
        {entries.map((entry) => {
          const name = formatTechniqueId(entry.technique_id);
          const successRate = entry.success_rate;
          const usage = { count: entry.shown_count, trend: 0 }; // trend not available in API
          const detail = techniqueDetails[entry.technique_id] || techniqueDetails[name];
          const isExpanded = expanded === entry.technique_id;
          const trendIcon = usage.trend > 0 ? '↑' : usage.trend < 0 ? '↓' : '→';
          const trendColor = usage.trend > 0 ? '#52C99A' : usage.trend < 0 ? '#E06060' : '#8A89A4';

          return (
            <Card key={entry.technique_id} className="overflow-hidden">
              {/* Collapsed State */}
              <button
                type="button"
                onClick={() => setExpanded(isExpanded ? null : entry.technique_id)}
                className="w-full"
              >
                <div className="flex items-center justify-between p-4 text-left">
                  <div className="flex-1">
                    <div className="mb-2 flex items-center gap-3">
                      <div className="font-medium text-textPrimary">{name}</div>
                      <div className="font-monoData text-sm text-textMuted">
                        {Math.round(successRate * 100)}%
                      </div>
                    </div>
                    <div className="mb-2">
                      <ProgressBar value={successRate} color="#7C6EF5" height={6} />
                    </div>
                    <div className="flex items-center gap-4 text-xs text-textMuted">
                      <span className="font-monoData">{usage.count}x used</span>
                      <span style={{ color: trendColor }}>
                        {trendIcon} {usage.trend !== 0 && `${Math.abs(usage.trend)}%`}
                      </span>
                    </div>
                  </div>
                  <div className="ml-4 text-textMuted">
                    {isExpanded ? '−' : '+'}
                  </div>
                </div>
              </button>

              {/* Expanded State */}
              <AnimatePresence>
                {isExpanded && detail && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.3 }}
                    className="border-t border-borderSubtle"
                  >
                    <div className="p-6 space-y-6">
                      {/* Description */}
                      <div>
                        <div className="mb-2 text-xs font-medium uppercase tracking-[0.16em] text-textMuted">
                          Description
                        </div>
                        <p className="text-sm leading-relaxed text-textPrimary">
                          {detail.description}
                        </p>
                      </div>

                      {/* Context */}
                      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        <div className="rounded-lg border border-accentMint/30 bg-accentMint/5 p-4">
                          <div className="mb-1 text-xs font-medium text-accentMint">
                            ✓ Best context
                          </div>
                          <div className="text-sm text-textPrimary">{detail.bestContext}</div>
                        </div>
                        <div className="rounded-lg border border-accentRed/30 bg-accentRed/5 p-4">
                          <div className="mb-1 text-xs font-medium text-accentRed">
                            ✗ Worst context
                          </div>
                          <div className="text-sm text-textPrimary">{detail.worstContext}</div>
                        </div>
                      </div>

                      {/* When it triggers */}
                      <div>
                        <div className="mb-2 text-xs font-medium uppercase tracking-[0.16em] text-textMuted">
                          When it triggers
                        </div>
                        <div className="text-sm text-textPrimary">{detail.triggerCondition}</div>
                      </div>

                      {/* Per-topic success rates */}
                      <div>
                        <div className="mb-3 text-xs font-medium uppercase tracking-[0.16em] text-textMuted">
                          Per-topic success rate
                        </div>
                        <div className="space-y-2">
                          {Object.entries(detail.perTopicRates).map(([topic, rate]) => (
                            <div key={topic} className="flex items-center gap-3">
                              <div className="w-32 text-xs text-textMuted">{topic}</div>
                              <div className="flex-1">
                                <ProgressBar value={rate} color="#7C6EF5" height={4} />
                              </div>
                              <div className="w-12 text-right font-monoData text-xs text-textMuted">
                                {Math.round(rate * 100)}%
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Success over time */}
                      <div>
                        <div className="mb-3 text-xs font-medium uppercase tracking-[0.16em] text-textMuted">
                          Success over time
                        </div>
                        <div className="flex items-center gap-2">
                          {detail.successOverTime.map((item, idx) => (
                            <div
                              key={idx}
                              className={`h-3 w-3 rounded-full ${
                                item.success ? 'bg-accentMint' : 'bg-accentRed'
                              }`}
                              title={`${item.date}: ${item.success ? 'Success' : 'Failure'}`}
                            />
                          ))}
                        </div>
                      </div>

                      {/* vs Global average */}
                      <div className="rounded-lg border border-borderSubtle bg-surfaceRaised p-4">
                        <div className="mb-1 text-xs font-medium text-textMuted">
                          vs. global average
                        </div>
                        <div className="text-sm text-textPrimary">
                          {Math.round(successRate * 100)}% vs {Math.round(detail.globalAverage * 100)}% global average
                          {' — '}
                          {successRate > detail.globalAverage ? (
                            <span className="text-accentMint">above average for you</span>
                          ) : (
                            <span className="text-accentRed">below average for you</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </Card>
          );
        })}
      </div>
    </motion.div>
  );
}
