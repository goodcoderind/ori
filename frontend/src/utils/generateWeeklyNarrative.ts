import type { DashboardSummary, SessionListItem } from '../types/api';

interface WeeklyNarrative {
  weekRange: string;
  numbers: {
    sessions: number;
    hours: number;
    avgFlow: number;
    vsLastWeek: {
      sessions: number;
      hours: number;
    };
  };
  bestSession: {
    day: string;
    time: string;
    topic: string;
    flow: number;
  } | null;
  hardestSession: {
    day: string;
    time: string;
    topic: string;
    flow: number;
  } | null;
  whatWorked: {
    technique: string;
    accepted: number;
    succeeded: number;
    message: string;
  } | null;
  whatDidnt: {
    message: string;
  } | null;
  pattern: {
    message: string;
  } | null;
  insights: Array<{
    day: string;
    topic: string;
    description: string;
  }>;
  nextWeek: {
    reviewsDue: number;
    recommendations: string[];
  };
}

export function generateWeeklyNarrative(
  summary: DashboardSummary,
  sessions: SessionListItem[]
): WeeklyNarrative {
  const now = Date.now();
  const weekMs = 7 * 24 * 60 * 60 * 1000;
  const lastWeekMs = weekMs * 2;

  const thisWeekSessions = sessions.filter(
    (s) => {
      const time = new Date(s.started_at).getTime();
      return time >= now - weekMs && time <= now;
    }
  );

  const lastWeekSessions = sessions.filter(
    (s) => {
      const time = new Date(s.started_at).getTime();
      return time >= now - lastWeekMs && time < now - weekMs;
    }
  );

  const thisWeekHours = thisWeekSessions.reduce((acc, s) => acc + s.duration_seconds, 0) / 3600;
  const lastWeekHours = lastWeekSessions.reduce((acc, s) => acc + s.duration_seconds, 0) / 3600;
  const flowSessions = thisWeekSessions.filter((s) => s.avg_confidence !== null && s.avg_confidence > 0.7).length;
  const avgFlow = thisWeekSessions.length > 0 ? flowSessions / thisWeekSessions.length : 0;

  const weekStart = new Date(now - weekMs);
  const weekEnd = new Date(now);
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const weekRange = `${monthNames[weekStart.getMonth()]} ${weekStart.getDate()} – ${monthNames[weekEnd.getMonth()]} ${weekEnd.getDate()}, ${weekEnd.getFullYear()}`;

  let bestSession: WeeklyNarrative['bestSession'] = null;
  let hardestSession: WeeklyNarrative['hardestSession'] = null;

  if (thisWeekSessions.length > 0) {
    const highConfSessions = thisWeekSessions
      .filter((s) => s.avg_confidence !== null && s.avg_confidence > 0.7)
      .sort((a, b) => b.duration_seconds - a.duration_seconds);

    if (highConfSessions.length > 0) {
      const best = highConfSessions[0];
      const date = new Date(best.started_at);
      bestSession = {
        day: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][date.getDay()],
        time: date.getHours() < 12 ? `${date.getHours()}am` : `${date.getHours() - 12 || 12}pm`,
        topic: best.topic_label,
        flow: best.avg_confidence ?? 0,
      };
    }

    const lowConfSessions = thisWeekSessions
      .filter((s) => s.avg_confidence !== null && s.avg_confidence < 0.5)
      .sort((a, b) => a.duration_seconds - b.duration_seconds);

    if (lowConfSessions.length > 0) {
      const hardest = lowConfSessions[0];
      const date = new Date(hardest.started_at);
      hardestSession = {
        day: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][date.getDay()],
        time: date.getHours() < 12 ? `${date.getHours()}am` : `${date.getHours() - 12 || 12}pm`,
        topic: hardest.topic_label,
        flow: hardest.avg_confidence ?? 0,
      };
    }
  }

  // What worked — from real technique success rates
  const topTechnique = summary.technique_success_rates.length > 0
    ? [...summary.technique_success_rates].sort((a, b) => b.success_rate - a.success_rate)[0]
    : null;
  const whatWorked: WeeklyNarrative['whatWorked'] = topTechnique
    ? {
        technique: topTechnique.technique_id.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
        accepted: topTechnique.shown_count,
        succeeded: Math.round(topTechnique.shown_count * topTechnique.success_rate),
        message: `${topTechnique.technique_id.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())} was your most effective technique — shown ${topTechnique.shown_count} times with a ${Math.round(topTechnique.success_rate * 100)}% success rate.`,
      }
    : null;

  // What didn't work — derived from low-acceptance techniques
  const worstTechnique = summary.technique_success_rates.length > 1
    ? [...summary.technique_success_rates].sort((a, b) => a.acceptance_rate - b.acceptance_rate)[0]
    : null;
  const whatDidnt: WeeklyNarrative['whatDidnt'] = worstTechnique && worstTechnique.acceptance_rate < 0.5
    ? {
        message: `${worstTechnique.technique_id.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())} had only a ${Math.round(worstTechnique.acceptance_rate * 100)}% acceptance rate. You may want to try different approaches when this is suggested.`,
      }
    : null;

  // Pattern — time of day analysis from real sessions
  const timeOfDayCounts = { morning: 0, afternoon: 0, evening: 0 };
  thisWeekSessions.forEach((s) => {
    const hour = new Date(s.started_at).getHours();
    if (hour >= 7 && hour < 12) timeOfDayCounts.morning++;
    else if (hour >= 12 && hour < 18) timeOfDayCounts.afternoon++;
    else timeOfDayCounts.evening++;
  });

  const dominantTime = Object.entries(timeOfDayCounts).sort((a, b) => b[1] - a[1])[0];
  const pattern: WeeklyNarrative['pattern'] = thisWeekSessions.length > 0
    ? {
        message: `You studied mostly in the ${dominantTime[0]} this week (${dominantTime[1]} of ${thisWeekSessions.length} sessions). ${flowSessions > 0 ? `${flowSessions} session${flowSessions !== 1 ? 's' : ''} reached high-confidence flow.` : 'No high-confidence flow sessions this week.'}`,
      }
    : null;

  // Insights — high-confidence sessions indicate potential breakthroughs
  const insights: WeeklyNarrative['insights'] = thisWeekSessions
    .filter((s) => s.avg_confidence !== null && s.avg_confidence > 0.85)
    .slice(0, 5)
    .map((s) => {
      const date = new Date(s.started_at);
      const day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][date.getDay()];
      return {
        day,
        topic: s.topic_label,
        description: `High-confidence session (${Math.round((s.avg_confidence ?? 0) * 100)}%) on ${s.topic_label}`,
      };
    });

  // Next week
  const reviewsDue = summary.upcoming_reviews.filter(
    (r) => new Date(r.next_probe_at).getTime() <= now + weekMs
  ).length;

  const recommendations: string[] = [];
  if (timeOfDayCounts.morning === 0 && thisWeekSessions.length > 0) {
    recommendations.push('Try a morning session to compare against your usual performance.');
  }
  if (reviewsDue > 0) {
    recommendations.push(`${reviewsDue} review${reviewsDue !== 1 ? 's' : ''} due: ${summary.upcoming_reviews.slice(0, 3).map(r => r.topic_label).join(', ')}.`);
  }

  return {
    weekRange,
    numbers: {
      sessions: thisWeekSessions.length,
      hours: thisWeekHours,
      avgFlow,
      vsLastWeek: {
        sessions: thisWeekSessions.length - lastWeekSessions.length,
        hours: thisWeekHours - lastWeekHours,
      },
    },
    bestSession,
    hardestSession,
    whatWorked,
    whatDidnt,
    pattern,
    insights,
    nextWeek: {
      reviewsDue,
      recommendations,
    },
  };
}
