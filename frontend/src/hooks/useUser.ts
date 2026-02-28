import { useMemo } from 'react';
import { getUserId } from '../utils/getUserId';

export function useUser() {
  const id = useMemo(() => getUserId(), []);
  const shortId = id.slice(0, 8);

  return { id, shortId };
}

