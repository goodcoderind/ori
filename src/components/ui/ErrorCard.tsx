import { Card } from './Card';

interface ErrorCardProps {
  message: string;
  onRetry?: () => void;
}

export function ErrorCard({ message, onRetry }: ErrorCardProps) {
  return (
    <Card className="flex items-center justify-between gap-4 border-accentRed/60 bg-accentRed/5">
      <div className="flex items-center gap-3">
        <span className="text-accentRed text-lg">!</span>
        <p className="text-sm text-textPrimary">{message}</p>
      </div>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="rounded-full border border-accentRed/70 px-3 py-1 text-xs font-medium text-accentRed hover:bg-accentRed/10"
        >
          Retry
        </button>
      )}
    </Card>
  );
}

