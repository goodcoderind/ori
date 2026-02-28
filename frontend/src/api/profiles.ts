import { apiClient } from './client';
import { getUserId } from '../utils/getUserId';
import { API } from '@shared/apiConfig';
import type { UserProfile } from '@shared/apiTypes';

const uid = () => getUserId();

export const updateProfile = (data: UserProfile) =>
  apiClient.put(API.PROFILE(uid()), data); // responds 204

export const deleteProfile = () =>
  apiClient.delete(API.PROFILE(uid())); // responds 204 — WIPES ALL DATA

export const exportProfile = async () => {
  const res = await apiClient.get(API.PROFILE_EXPORT(uid()), {
    responseType: 'blob',
  });
  const url = URL.createObjectURL(res.data);
  const a = document.createElement('a');
  a.href = url;
  a.download = `deepit-profile-${uid().slice(0, 8)}.json`;
  a.click();
  URL.revokeObjectURL(url);
};
