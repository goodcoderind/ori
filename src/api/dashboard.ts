import { apiClient } from './client';
import type { DashboardSummary, SessionListItem, SessionDetail } from '../types/api';
import { getUserId } from '../utils/getUserId';

export const getDashboardSummary = () =>
  apiClient.get<DashboardSummary>('/dashboard/summary', {
    params: { user_id: getUserId() },
  });

export const getSessions = () =>
  apiClient.get<SessionListItem[]>('/dashboard/sessions', {
    params: { user_id: getUserId() },
  });

export const getSessionDetail = (sessionId: string) =>
  apiClient.get<SessionDetail>(`/dashboard/session/${sessionId}`, {
    params: { user_id: getUserId() },
  });

