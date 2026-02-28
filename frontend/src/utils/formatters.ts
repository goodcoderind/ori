// 2880 → "48 min" | 4500 → "1h 15min"
export function formatDuration(seconds: number): string {
  const m = Math.round(seconds / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem > 0 ? `${h}h ${rem}min` : `${h}h`;
}

// 0.82 → "82%"
export function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

// ISO → "2h ago" | "3d ago" | "Mar 15"
export function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ISO + overdue → "overdue" | "due in 2 hours" | "due Mar 18"
export function formatDueTime(iso: string, overdue: boolean): string {
  if (overdue) return 'overdue';
  const diff = new Date(iso).getTime() - Date.now();
  const h = Math.floor(diff / 3600000);
  if (h < 1) return 'due in < 1 hour';
  if (h < 24) return `due in ${h}h`;
  const d = Math.floor(h / 24);
  return `due in ${d} day${d > 1 ? 's' : ''}`;
}

// "feynman" → "Feynman" | "modality_switching" → "Modality Switching"
export function formatTechniqueId(id: string): string {
  return id.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

// "morning" → "Morning" etc.
export function formatPeriod(key: string): string {
  return key.charAt(0).toUpperCase() + key.slice(1);
}

// Legacy aliases for backward compatibility
export const formatDurationMinutes = formatDuration;
export const formatRelativeTime = formatRelative;
export const formatPercentage = formatPercent;
export const formatPeakRange = formatPeriod;
