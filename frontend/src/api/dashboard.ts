import { apiClient } from './client';
import { getUserId } from '../utils/getUserId';
import { API } from '@shared/apiConfig';
import type { DashboardSummary, SessionListItem, SessionDetail } from '@shared/apiTypes';

const uid = () => getUserId();

export const getDashboardSummary = () =>
  apiClient.get<DashboardSummary>(API.DASHBOARD_SUMMARY, {
    params: { user_id: uid() },
  });

export const getSessions = (limit = 20) =>
  apiClient.get<SessionListItem[]>(API.DASHBOARD_SESSIONS, {
    params: { user_id: uid(), limit },
  });

export const getSessionDetail = (session_id: string) =>
  apiClient.get<SessionDetail>(API.DASHBOARD_SESSION(session_id), {
    params: { user_id: uid() },
  });
