import axios from 'axios';

export function handleApiError(err: unknown): { message: string; retryAfter?: number } {
  if (!axios.isAxiosError(err)) return { message: 'Unknown error' };

  const status = err.response?.status;
  const body = err.response?.data?.error;

  if (status === 429) {
    const retryAfter = parseInt(err.response?.headers?.['retry-after'] ?? '10', 10);
    return { message: 'Too many requests. Retrying…', retryAfter };
  }
  if (status === 401) return { message: 'Session expired. Reconnecting…' };
  if (status === 403) return { message: 'Access denied.' };
  if (status === 404) return { message: body?.message ?? 'Not found.' };
  if (status === 502) return { message: 'AI service temporarily unavailable. Please retry.' };

  return { message: body?.message ?? 'Something went wrong.' };
}
