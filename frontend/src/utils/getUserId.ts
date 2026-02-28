export function getUserId(): string {
  // The extension mirrors its UUID to localStorage under this key.
  // If the user opens the dashboard without the extension, we generate one.
  let uid = localStorage.getItem('prosocratic_user_id');
  if (!uid) {
    uid = crypto.randomUUID();
    localStorage.setItem('prosocratic_user_id', uid);
  }
  return uid;
}
