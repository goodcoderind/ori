import type { SessionDetail } from '../../types/api';
import { Card } from '../ui/Card';
import { formatPercent, formatRelative } from '../../utils/formatters';

interface AssessmentLogProps {
  session: SessionDetail;
}

export function AssessmentLog({ session }: AssessmentLogProps) {
  if (!session.assessments.length) return null;

  return (
    <Card hoverable className="space-y-4">
      <div>
        <div className="text-xs font-medium uppercase tracking-[0.16em] text-textMuted">
          Assessment Log
        </div>
        <div className="mt-1 font-serifDisplay text-lg italic text-textPrimary">
          How well you understood
        </div>
      </div>

      <div className="space-y-6">
        {session.assessments.map((assessment) => (
          <div key={assessment.probe_set_id} className="space-y-3">
            <div className="text-xs text-textMuted">
              <div className="mb-1 font-medium text-textPrimary">{assessment.topic_label}</div>
              <div className="mb-2 text-[11px]">Recall: {assessment.recall_probe}</div>
              <div className="text-[11px]">Transfer: {assessment.transfer_probe}</div>
            </div>

            <div className="space-y-2">
              {assessment.attempts.map((attempt, idx) => {
                const scoreColor = attempt.score_0_1 < 0.4 
                  ? '#E06060' 
                  : attempt.score_0_1 < 0.7 
                  ? '#F0A55A' 
                  : '#52C99A';
                
                return (
                  <div
                    key={`${attempt.ts}-${idx}`}
                    className="flex items-center gap-3 rounded-lg glass p-3"
                  >
                    <div className="flex items-center gap-2">
                      <div
                        className="h-12 w-12 rounded-full border-2 flex items-center justify-center font-monoData text-sm font-medium"
                        style={{
                          borderColor: scoreColor,
                          color: scoreColor,
                        }}
                      >
                        {formatPercent(attempt.score_0_1)}
                      </div>
                      <div className="flex flex-col">
                        <div className="text-xs font-medium text-textPrimary">
                          {attempt.probe_type}
                        </div>
                        <div className="text-[10px] text-textMuted">
                          {attempt.error_type.replace('_', ' ')}
                        </div>
                      </div>
                    </div>
                    <div className="ml-auto text-[10px] font-monoData text-textFaint">
                      {formatRelative(attempt.ts)}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
