import { apiClient } from './client';
import { getUserId } from '../utils/getUserId';
import type { UserProfile } from '../types/api';

const uid = () => getUserId();

export const updateProfile = (data: UserProfile) =>
  apiClient.put(`/v1/profiles/${uid()}`, data); // responds 204

export const deleteProfile = () =>
  apiClient.delete(`/v1/profiles/${uid()}`); // responds 204 — WIPES ALL DATA

export const exportProfile = async () => {
  const res = await apiClient.get(`/v1/profiles/${uid()}/export`, {
    responseType: 'blob',
  });
  const url = URL.createObjectURL(res.data);
  const a = document.createElement('a');
  a.href = url;
  a.download = `deepit-profile-${uid().slice(0, 8)}.json`;
  a.click();
  URL.revokeObjectURL(url);
};
