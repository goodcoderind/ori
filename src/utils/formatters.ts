export function formatDurationMinutes(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes} min`;
  if (minutes === 0) return `${hours} hr`;
  return `${hours} hr ${minutes} min`;
}

export function formatRelativeTime(iso: string): string {
  const now = new Date();
  const target = new Date(iso);
  const diffMs = target.getTime() - now.getTime();
  const past = diffMs < 0;
  const absMs = Math.abs(diffMs);

  const minutes = Math.round(absMs / 60000);
  const hours = Math.round(absMs / 3600000);
  const days = Math.round(absMs / 86400000);

  const suffix = past ? 'ago' : 'from now';

  if (minutes < 60) return `${minutes} min ${suffix}`;
  if (hours < 48) return `${hours} hr ${suffix}`;
  return `${days} days ${suffix}`;
}

export function formatPercentage(value: number): string {
  return `${Math.round(value * 100)}%`;
}

export function formatPeakRange(label: 'morning' | 'afternoon' | 'night'): string {
  switch (label) {
    case 'morning':
      return '7–11 AM';
    case 'afternoon':
      return '1–5 PM';
    case 'night':
      return '7–11 PM';
    default:
      return label;
  }
}

