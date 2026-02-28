import { apiClient } from './client';
import { getUserId } from '../utils/getUserId';
import type { DashboardSummary, SessionListItem, SessionDetail } from '../types/api';

const uid = () => getUserId();

export const getDashboardSummary = () =>
  apiClient.get<DashboardSummary>('/v1/dashboard/summary', {
    params: { user_id: uid() },
  });

export const getSessions = (limit = 20) =>
  apiClient.get<SessionListItem[]>('/v1/dashboard/sessions', {
    params: { user_id: uid(), limit },
  });

export const getSessionDetail = (session_id: string) =>
  apiClient.get<SessionDetail>(`/v1/dashboard/session/${session_id}`, {
    params: { user_id: uid() },
  });
