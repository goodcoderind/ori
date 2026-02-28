import { useEffect, useState } from 'react';
import type { SessionDetail } from '../types/api';
import { getSessionDetail } from '../api/dashboard';
import { mockSessionDetail } from '../api/mock';
import { handleApiError } from '../utils/handleApiError';

// Default to mock data unless explicitly disabled with VITE_USE_MOCK="false"
const USE_MOCK = (import.meta.env.VITE_USE_MOCK ?? 'true') === 'true';

interface UseSessionState {
  session: SessionDetail | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useSession(sessionId: string | undefined): UseSessionState {
  const [session, setSession] = useState<SessionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        if (USE_MOCK) {
          if (cancelled) return;
          setSession(mockSessionDetail);
        } else {
          const res = await getSessionDetail(sessionId);
          if (cancelled) return;
          setSession(res.data);
        }
      } catch (err) {
        if (cancelled) return;
        const errorInfo = handleApiError(err);
        setError(errorInfo.message);
        
        // Handle 429 retry
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
  }, [sessionId, reloadKey]);

  return {
    session,
    loading,
    error,
    refetch: () => setReloadKey((k) => k + 1),
  };
}

