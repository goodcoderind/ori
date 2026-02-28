import { useEffect, useState } from 'react';
import type { DashboardSummary, SessionListItem } from '../types/api';
import { getDashboardSummary, getSessions } from '../api/dashboard';
import { handleApiError } from '../utils/handleApiError';

interface UseDashboardState {
  summary: DashboardSummary | null;
  sessions: SessionListItem[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useDashboard(): UseDashboardState {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [sessions, setSessions] = useState<SessionListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [summaryRes, sessionsRes] = await Promise.all([
          getDashboardSummary(),
          getSessions(),
        ]);
        if (cancelled) return;
        setSummary(summaryRes.data);
        setSessions(sessionsRes.data);
      } catch (err) {
        if (cancelled) return;
        const errorInfo = handleApiError(err);
        setError(errorInfo.message);

        if (errorInfo.retryAfter) {
          setTimeout(() => {
            if (!cancelled) {
              setReloadKey((k) => k + 1);
            }
          }, errorInfo.retryAfter * 1000);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  return {
    summary,
    sessions,
    loading,
    error,
    refetch: () => setReloadKey((k) => k + 1),
  };
}
