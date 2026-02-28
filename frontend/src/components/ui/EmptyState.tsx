import type { ReactNode } from 'react';
import { Card } from './Card';

interface EmptyStateProps {
  title?: string;
  description?: ReactNode;
}

export function EmptyState({
  title = 'Nothing here yet.',
  description = 'Start a study session with the DeepIt extension to see your learning patterns.',
}: EmptyStateProps) {
  return (
    <Card className="flex flex-col items-center gap-2 text-center py-10">
      <div className="text-4xl mb-1">😴</div>
      <div className="text-sm font-medium text-textPrimary">{title}</div>
      <div className="max-w-md text-xs text-textMuted">
        {description}
      </div>
    </Card>
  );
}

