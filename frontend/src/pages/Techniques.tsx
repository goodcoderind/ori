import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useDashboard } from '../hooks/useDashboard';
import { Spinner } from '../components/ui/Spinner';
import { ErrorCard } from '../components/ui/ErrorCard';
import { Card } from '../components/ui/Card';
import { ProgressBar } from '../components/ui/ProgressBar';
import { formatTechniqueId } from '../utils/formatters';

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
          {entries.reduce((sum, e) => sum + e.shown_count, 0)}+ interactions.
        </div>
      </div>

      <div className="space-y-3">
        {entries.map((entry) => {
          const name = formatTechniqueId(entry.technique_id);
          const successRate = entry.success_rate;
          const isExpanded = expanded === entry.technique_id;

          return (
            <Card key={entry.technique_id} className="overflow-hidden">
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
                      <span className="font-monoData">{entry.shown_count}x shown</span>
                      <span className="font-monoData">
                        {Math.round(entry.acceptance_rate * 100)}% accepted
                      </span>
                    </div>
                  </div>
                  <div className="ml-4 text-textMuted">
                    {isExpanded ? '−' : '+'}
                  </div>
                </div>
              </button>

              <AnimatePresence>
                {isExpanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.3 }}
                    className="border-t border-borderSubtle"
                  >
                    <div className="p-6 space-y-4">
                      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                        <div className="rounded-lg border border-borderSubtle bg-surfaceRaised p-4">
                          <div className="mb-1 text-xs font-medium text-textMuted">
                            Success rate
                          </div>
                          <div className="text-lg font-monoData text-textPrimary">
                            {Math.round(successRate * 100)}%
                          </div>
                        </div>
                        <div className="rounded-lg border border-borderSubtle bg-surfaceRaised p-4">
                          <div className="mb-1 text-xs font-medium text-textMuted">
                            Acceptance rate
                          </div>
                          <div className="text-lg font-monoData text-textPrimary">
                            {Math.round(entry.acceptance_rate * 100)}%
                          </div>
                        </div>
                        <div className="rounded-lg border border-borderSubtle bg-surfaceRaised p-4">
                          <div className="mb-1 text-xs font-medium text-textMuted">
                            Times shown
                          </div>
                          <div className="text-lg font-monoData text-textPrimary">
                            {entry.shown_count}
                          </div>
                        </div>
                      </div>

                      <div className="rounded-lg border border-borderSubtle bg-surfaceRaised p-4">
                        <div className="mb-1 text-xs font-medium text-textMuted">
                          Effectiveness
                        </div>
                        <div className="text-sm text-textPrimary">
                          {successRate >= 0.8 ? (
                            <span className="text-accentMint">Highly effective for you — keep using this technique.</span>
                          ) : successRate >= 0.5 ? (
                            <span>Moderately effective — works well in some contexts.</span>
                          ) : (
                            <span className="text-accentRed">Below average — consider alternatives when this is suggested.</span>
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
