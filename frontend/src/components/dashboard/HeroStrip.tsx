import { motion } from 'framer-motion';
import { CountUp } from '../ui/CountUp';
import type { DashboardSummary, SessionListItem } from '../../types/api';

interface HeroStripProps {
  summary: DashboardSummary;
  sessions: SessionListItem[];
}

function computeStats(sessions: SessionListItem[], summary: DashboardSummary) {
  const now = Date.now();
  const weekMs = 7 * 24 * 60 * 60 * 1000;
  
  // Total sessions
  const totalSessions = sessions.length;
  const weekSessions = sessions.filter(
    (s) => now - new Date(s.started_at).getTime() <= weekMs
  ).length;
  const lastWeekSessions = sessions.filter(
    (s) => {
      const time = new Date(s.started_at).getTime();
      return time <= now - weekMs && time > now - weekMs * 2;
    }
  ).length;
  const sessionDelta = weekSessions - lastWeekSessions;

  // Total hours (convert seconds to hours)
  const totalHours = sessions.reduce((acc, s) => acc + s.duration_seconds, 0) / 3600;
  const weekHours = sessions
    .filter((s) => now - new Date(s.started_at).getTime() <= weekMs)
    .reduce((acc, s) => acc + s.duration_seconds, 0) / 3600;
  const lastWeekHours = sessions
    .filter((s) => {
      const time = new Date(s.started_at).getTime();
      return time <= now - weekMs && time > now - weekMs * 2;
    })
    .reduce((acc, s) => acc + s.duration_seconds, 0) / 3600;
  const hoursDelta = weekHours - lastWeekHours;

  // Day streak
  const sessionDates = new Set(
    sessions.map((s) => {
      const d = new Date(s.started_at);
      return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    })
  );
  const sortedDates = Array.from(sessionDates)
    .map((d) => new Date(d))
    .sort((a, b) => b.getTime() - a.getTime());
  
  let streak = 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  for (let i = 0; i < sortedDates.length; i++) {
    const checkDate = new Date(today);
    checkDate.setDate(today.getDate() - i);
    checkDate.setHours(0, 0, 0, 0);
    
    const hasSession = sortedDates.some((sd) => {
      const sdDate = new Date(sd);
      sdDate.setHours(0, 0, 0, 0);
      return sdDate.getTime() === checkDate.getTime();
    });
    
    if (hasSession) {
      streak++;
    } else {
      break;
    }
  }

  // Flow ratio - estimate by confidence (sessions don't have dominant_state)
  const flowSessions = sessions.filter((s) => s.avg_confidence !== null && s.avg_confidence > 0.7).length;
  const avgFlowRatio = sessions.length > 0 ? flowSessions / sessions.length : 0;
  
  // Calculate flow delta (simplified - compare last week to week before)
  const lastWeekFlow = sessions
    .filter((s) => {
      const time = new Date(s.started_at).getTime();
      return time <= now - weekMs && time > now - weekMs * 2;
    })
    .filter((s) => s.avg_confidence !== null && s.avg_confidence > 0.7).length;
  const lastWeekTotal = sessions.filter((s) => {
    const time = new Date(s.started_at).getTime();
    return time <= now - weekMs && time > now - weekMs * 2;
  }).length;
  const lastWeekFlowRatio = lastWeekTotal > 0 ? lastWeekFlow / lastWeekTotal : 0;
  const flowDelta = avgFlowRatio - lastWeekFlowRatio;

  return {
    totalSessions,
    sessionDelta,
    totalHours,
    hoursDelta,
    streak,
    avgFlowRatio,
    flowDelta,
  };
}

export function HeroStrip({ summary, sessions }: HeroStripProps) {
  const stats = computeStats(sessions, summary);

  return (
    <section className="h-full flex items-center">
      <div className="grid grid-cols-3 gap-6 w-full h-full">
        {/* Sessions */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="bento-cell bento-cell-indigo p-5"
        >
          <div className="mb-2 font-monoData text-5xl font-light text-accentPrimary">
            <CountUp end={stats.totalSessions} />
          </div>
          <div className="mb-2 text-sm font-medium uppercase tracking-wider text-textMuted">
            Sessions
          </div>
          {stats.sessionDelta !== 0 && (
            <div className={`text-[10px] font-medium ${stats.sessionDelta >= 0 ? 'text-gray-400' : 'text-gray-600'}`}>
              {stats.sessionDelta >= 0 ? '+' : ''}{stats.sessionDelta} this week
        </div>
          )}
        </motion.div>

        {/* Hours */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="bento-cell bento-cell-teal p-5"
        >
          <div className="mb-2 font-monoData text-5xl font-light text-accentTeal">
            <CountUp end={Math.round(stats.totalHours * 10) / 10} />
          </div>
          <div className="mb-2 text-sm font-medium uppercase tracking-wider text-textMuted">
            Hours
          </div>
          {stats.hoursDelta !== 0 && (
            <div className={`text-[10px] font-medium ${stats.hoursDelta >= 0 ? 'text-gray-400' : 'text-gray-600'}`}>
              {stats.hoursDelta >= 0 ? '+' : ''}{Math.round(stats.hoursDelta * 10) / 10}h this week
        </div>
          )}
        </motion.div>

        {/* Flow Ratio */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="bento-cell bento-cell-blue p-5"
        >
          <div className="mb-2 font-monoData text-5xl font-light text-accentPrimary">
            <CountUp end={Math.round(stats.avgFlowRatio * 100)} />%
          </div>
          <div className="mb-2 text-sm font-medium uppercase tracking-wider text-textMuted">
            Flow Ratio
          </div>
          {stats.flowDelta !== 0 && (
            <div className={`text-[10px] font-medium ${stats.flowDelta >= 0 ? 'text-gray-400' : 'text-gray-600'}`}>
              {stats.flowDelta >= 0 ? '+' : ''}{Math.round(stats.flowDelta * 100)}% vs last week
        </div>
          )}
      </motion.div>
      </div>
    </section>
  );
}
