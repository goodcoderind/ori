import type { SessionDetail } from '../../types/api';
import { Card } from '../ui/Card';
import { formatTechniqueId } from '../../utils/formatters';

interface SuggestionLogProps {
  session: SessionDetail;
}

export function SuggestionLog({ session }: SuggestionLogProps) {
  // Filter event_timeline for suggestions
  const suggestions = session.event_timeline.filter(
    (e) => e.suggestion_type !== 'NONE'
  );
  
  if (!suggestions.length) return null;

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
              <th className="px-2 py-1 text-left">Time</th>
              <th className="px-2 py-1 text-left">Type</th>
              <th className="px-2 py-1 text-left">Technique</th>
              <th className="px-2 py-1 text-left">State</th>
              <th className="px-2 py-1 text-left">Confidence</th>
              <th className="px-2 py-1 text-left">Ori State</th>
            </tr>
          </thead>
          <tbody>
            {suggestions.map((suggestion, idx) => (
              <tr
                key={`${suggestion.ts}-${idx}`}
                className="rounded-md glass"
              >
                <td className="px-2 py-1.5 font-monoData text-[10px]">
                  {new Date(suggestion.ts).toLocaleTimeString()}
                </td>
                <td className="px-2 py-1.5 text-textPrimary">
                  {suggestion.suggestion_type.replace('_', ' ')}
                </td>
                <td className="px-2 py-1.5">
                  {suggestion.suggestion_id ? formatTechniqueId(suggestion.suggestion_id) : '—'}
                </td>
                <td className="px-2 py-1.5 text-textPrimary">
                  {suggestion.state_label.replace('_', ' ')}
                </td>
                <td className="px-2 py-1.5 font-monoData">
                  {Math.round(suggestion.confidence * 100)}%
                </td>
                <td className="px-2 py-1.5 text-textFaint">
                  {suggestion.ori_state.replace('_', ' ')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
