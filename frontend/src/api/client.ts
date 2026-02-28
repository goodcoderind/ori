import axios from 'axios';
import { getUserId } from '../utils/getUserId';

export const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000',
});

apiClient.interceptors.request.use((config) => {
  config.headers['X-User-Id'] = getUserId();
  config.headers['Content-Type'] = 'application/json';
  return config;
});

// Log X-Request-Id for every response — include in bug reports
apiClient.interceptors.response.use(
  (res) => {
    const reqId = res.headers['x-request-id'];
    if (reqId && import.meta.env.DEV) {
      console.debug('[DeepIt] X-Request-Id:', reqId);
    }
    return res;
  },
  (err) => {
    const reqId = err.response?.headers?.['x-request-id'];
    if (reqId) {
      console.error('[DeepIt] Failed request X-Request-Id:', reqId);
    }
    return Promise.reject(err);
  }
);