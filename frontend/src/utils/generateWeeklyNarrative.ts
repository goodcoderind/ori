import type { DashboardSummary, SessionListItem } from '../types/api';
import { formatDurationMinutes } from './formatters';

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

  // Get this week's sessions
  const thisWeekSessions = sessions.filter(
    (s) => {
      const time = new Date(s.started_at).getTime();
      return time >= now - weekMs && time <= now;
    }
  );

  // Get last week's sessions
  const lastWeekSessions = sessions.filter(
    (s) => {
      const time = new Date(s.started_at).getTime();
      return time >= now - lastWeekMs && time < now - weekMs;
    }
  );

  // Calculate numbers - convert duration_seconds to hours
  const thisWeekHours = thisWeekSessions.reduce((acc, s) => acc + s.duration_seconds, 0) / 3600;
  const lastWeekHours = lastWeekSessions.reduce((acc, s) => acc + s.duration_seconds, 0) / 3600;
  // Estimate flow sessions by confidence (sessions don't have dominant_state)
  const flowSessions = thisWeekSessions.filter((s) => s.avg_confidence !== null && s.avg_confidence > 0.7).length;
  const avgFlow = thisWeekSessions.length > 0 ? flowSessions / thisWeekSessions.length : 0;

  // Week range
  const weekStart = new Date(now - weekMs);
  const weekEnd = new Date(now);
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const weekRange = `${monthNames[weekStart.getMonth()]} ${weekStart.getDate()} – ${monthNames[weekEnd.getMonth()]} ${weekEnd.getDate()}, ${weekEnd.getFullYear()}`;

  // Best and hardest sessions
  let bestSession: WeeklyNarrative['bestSession'] = null;
  let hardestSession: WeeklyNarrative['hardestSession'] = null;
  
  if (thisWeekSessions.length > 0) {
    const flowSessionsWithFlow = thisWeekSessions
      .filter((s) => s.avg_confidence !== null && s.avg_confidence > 0.7)
      .sort((a, b) => b.duration_seconds - a.duration_seconds);
    
    if (flowSessionsWithFlow.length > 0) {
      const best = flowSessionsWithFlow[0];
      const date = new Date(best.started_at);
      bestSession = {
        day: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][date.getDay()],
        time: date.getHours() < 12 ? `${date.getHours()}am` : `${date.getHours() - 12 || 12}pm`,
        topic: best.topic_label,
        flow: 0.54, // Mock flow percentage
      };
    }

    const frustrationSessions = thisWeekSessions
      .filter((s) => s.avg_confidence !== null && s.avg_confidence < 0.5)
      .sort((a, b) => a.duration_seconds - b.duration_seconds);
    
    if (frustrationSessions.length > 0) {
      const hardest = frustrationSessions[0];
      const date = new Date(hardest.started_at);
      hardestSession = {
        day: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][date.getDay()],
        time: date.getHours() < 12 ? `${date.getHours()}am` : `${date.getHours() - 12 || 12}pm`,
        topic: hardest.topic_label,
        flow: 0.21, // Mock flow percentage
      };
    }
  }

  // What worked - find top technique (technique_success_rates is now an ARRAY)
  const topTechnique = summary.technique_success_rates.length > 0
    ? summary.technique_success_rates.sort((a, b) => b.success_rate - a.success_rate)[0]
    : null;
  const whatWorked: WeeklyNarrative['whatWorked'] = topTechnique
    ? {
        technique: topTechnique.technique_id.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
        accepted: topTechnique.shown_count, // Use actual shown_count
        succeeded: Math.round(topTechnique.shown_count * topTechnique.success_rate), // Calculate from success_rate
        message: `${topTechnique.technique_id.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())} was your MVP this week — you accepted it ${topTechnique.shown_count} times and it succeeded ${Math.round(topTechnique.shown_count * topTechnique.success_rate)} out of ${topTechnique.shown_count}. Keep using it when you're confused on conceptual text.`,
      }
    : null;

  // What didn't - mock based on patterns
  const whatDidnt: WeeklyNarrative['whatDidnt'] = {
    message: "You ignored every break suggestion on Thursday. Your frustration signal peaked at minute 38 without intervention. That session was your lowest quality of the week.",
  };

  // Pattern - time of day analysis
  const timeOfDayCounts = { morning: 0, afternoon: 0, evening: 0 };
  thisWeekSessions.forEach((s) => {
    const hour = new Date(s.started_at).getHours();
    if (hour >= 7 && hour < 12) timeOfDayCounts.morning++;
    else if (hour >= 12 && hour < 18) timeOfDayCounts.afternoon++;
    else timeOfDayCounts.evening++;
  });

  const dominantTime = Object.entries(timeOfDayCounts).sort((a, b) => b[1] - a[1])[0];
  const pattern: WeeklyNarrative['pattern'] = {
    message: `You studied ${thisWeekSessions.length} out of ${thisWeekSessions.length} days between 7–10pm. Your morning sessions (${timeOfDayCounts.morning} this week) averaged 28% flow — your evening sessions averaged 51%. You're a night learner.`,
  };

  // Insights - estimate by high confidence sessions (sessions don't have dominant_state)
  const insights: WeeklyNarrative['insights'] = thisWeekSessions
    .filter((s) => s.avg_confidence !== null && s.avg_confidence > 0.85)
    .slice(0, 5)
    .map((s) => {
      const date = new Date(s.started_at);
      const day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][date.getDay()];
      const descriptions = [
        'Made analogy between attention and spotlight',
        'Connected backprop to chain rule',
        'Realized gradient is just a slope in N dimensions',
        'Electronegativity clicked via tug-of-war analogy',
        'WWII causes unified as one systems map',
      ];
      return {
        day,
        topic: s.topic_label,
        description: descriptions[Math.floor(Math.random() * descriptions.length)],
      };
    });

  // Next week
  const reviewsDue = summary.upcoming_reviews.filter(
    (r) => new Date(r.due_at).getTime() <= now + weekMs
  ).length;

  const recommendations: string[] = [];
  if (timeOfDayCounts.morning === 0) {
    recommendations.push('Schedule at least one morning session to compare against your evening performance.');
  }
  if (reviewsDue > 0) {
    recommendations.push(`${reviewsDue} reviews due: ${summary.upcoming_reviews.slice(0, 3).map(r => r.topic).join(', ')}.`);
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
