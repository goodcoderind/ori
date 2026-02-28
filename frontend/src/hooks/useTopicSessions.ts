import { useMemo } from 'react';
import type { SessionListItem } from '../types/api';

export function useTopicSessions(
  allSessions: SessionListItem[],
  topicLabel: string | undefined,
) {
  return useMemo(
    () => allSessions.filter((s) => !topicLabel || s.topic_label === topicLabel),
    [allSessions, topicLabel],
  );
}

