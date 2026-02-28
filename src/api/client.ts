import axios from 'axios';
import { getUserId } from '../utils/getUserId';

export const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || 'https://api.deepit.app/v1',
  headers: { 'Content-Type': 'application/json' },
});

apiClient.interceptors.request.use((config) => {
  // eslint-disable-next-line no-param-reassign
  config.headers = config.headers ?? {};
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  (config.headers as Record<string, string>)['X-User-Id'] = getUserId();
  return config;
});

