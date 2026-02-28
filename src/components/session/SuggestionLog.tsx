import type { SessionDetail } from '../../types/api';
import { Card } from '../ui/Card';

interface SuggestionLogProps {
  session: SessionDetail;
}

const typeLabels: Record<string, string> = {
  NONE: 'None',
  MICRO_ASSESS: 'Micro-assessment',
  TECHNIQUE: 'Technique',
  BREAK: 'Break',
  UNASKED_QUESTION: 'Unasked question',
};

export function SuggestionLog({ session }: SuggestionLogProps) {
  const rows = session.suggestions_triggered;
  if (!rows.length) return null;

  return (
    <Card hoverable className="space-y-4">
      <div>
        <div className="text-xs font-medium uppercase tracking-[0.16em] text-textMuted">
          Suggestions
        </div>
        <div className="mt-1 font-serifDisplay text-lg italic text-textPrimary">
          What DeepIt nudged you to try
        </div>
      </div>

      <div className="overflow-x-auto text-xs text-textMuted">
        <table className="min-w-full border-separate border-spacing-y-1">
          <thead>
            <tr className="text-[11px] uppercase tracking-[0.18em] text-textFaint">
              <th className="px-2 py-1 text-left">Type</th>
              <th className="px-2 py-1 text-left">Technique</th>
              <th className="px-2 py-1 text-left">Accepted</th>
              <th className="px-2 py-1 text-left">Outcome</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => (
              <tr
                key={`${row.type}-${row.technique_id}-${idx}`}
                className="rounded-md bg-surfaceRaised/40"
              >
                <td className="px-2 py-1.5 text-textPrimary">
                  {typeLabels[row.type] ?? row.type}
                </td>
                <td className="px-2 py-1.5">
                  {row.technique_id || '—'}
                </td>
                <td className="px-2 py-1.5">
                  {row.accepted ? (
                    <span className="text-accentMint">✓ Yes</span>
                  ) : (
                    <span className="text-textFaint">✗ No</span>
                  )}
                </td>
                <td className="px-2 py-1.5">
                  {row.outcome === 'success' && (
                    <span className="text-accentMint">Success</span>
                  )}
                  {row.outcome === 'failure' && (
                    <span className="text-accentRed">Didn&apos;t help</span>
                  )}
                  {row.outcome === 'unknown' && (
                    <span className="text-textFaint">Unknown</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

