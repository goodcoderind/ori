export function getUserId(): string {
  if (typeof window === 'undefined') {
    // SSR / non-browser safety
    return 'server-user';
  }

  let uid = window.localStorage.getItem('deepit_user_id');
  if (!uid) {
    uid = crypto.randomUUID();
    window.localStorage.setItem('deepit_user_id', uid);
  }
  return uid;
}

