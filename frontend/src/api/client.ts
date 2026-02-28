import axios from 'axios';
import { getUserId } from '../utils/getUserId';
import { DEFAULT_API_BASE_URL, USER_ID_HEADER } from '@shared/apiConfig';

export const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? DEFAULT_API_BASE_URL,
});

apiClient.interceptors.request.use((config) => {
  config.headers[USER_ID_HEADER] = getUserId();
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