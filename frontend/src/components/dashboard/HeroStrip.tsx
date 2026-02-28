import { motion } from 'framer-motion';
import { CountUp } from '../ui/CountUp';
import type { DashboardSummary, SessionListItem } from '../../types/api';
import { formatRelativeTime } from '../../utils/formatters';

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

  // Flow ratio
  const flowSessions = sessions.filter((s) => s.dominant_state === 'FLOW').length;
  const avgFlowRatio = sessions.length > 0 ? flowSessions / sessions.length : 0;
  
  // Calculate flow delta (simplified - compare last week to week before)
  const lastWeekFlow = sessions
    .filter((s) => {
      const time = new Date(s.started_at).getTime();
      return time <= now - weekMs && time > now - weekMs * 2;
    })
    .filter((s) => s.dominant_state === 'FLOW').length;
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
  const greeting = (() => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  })();

  return (
    <section className="mb-12 grid grid-cols-1 gap-8 lg:grid-cols-2">
      {/* Left: Greeting */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="flex flex-col justify-center"
      >
        <div className="text-sm font-medium text-textMuted">{greeting}.</div>
        <div className="mt-2 font-serifDisplay text-5xl italic leading-tight text-textPrimary lg:text-6xl">
          Here&apos;s how
          <br />
          you&apos;ve been learning.
        </div>
      </motion.div>

      {/* Right: Stats Grid */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.1 }}
        className="grid grid-cols-2 gap-4"
      >
        {/* Sessions */}
        <div className="glass rounded-2xl p-6">
          <div className="mb-1 font-monoData text-3xl font-medium text-textPrimary">
            <CountUp end={stats.totalSessions} />
          </div>
          <div className="mb-2 text-xs font-medium text-textMuted">sessions</div>
          <div className="flex items-center gap-1.5">
            {stats.sessionDelta >= 0 ? (
              <>
                <span className="rounded-full bg-accentMint/20 px-2 py-0.5 text-[10px] font-medium text-accentMint">
                  +{stats.sessionDelta} this week
                </span>
              </>
            ) : (
              <span className="rounded-full bg-accentRed/20 px-2 py-0.5 text-[10px] font-medium text-accentRed">
                {stats.sessionDelta} this week
              </span>
            )}
          </div>
        </div>

        {/* Hours */}
        <div className="glass rounded-2xl p-6">
          <div className="mb-1 font-monoData text-3xl font-medium text-textPrimary">
            <CountUp end={stats.totalHours} decimals={1} />
          </div>
          <div className="mb-2 text-xs font-medium text-textMuted">hours learned</div>
          <div className="flex items-center gap-1.5">
            {stats.hoursDelta >= 0 ? (
              <span className="rounded-full bg-accentMint/20 px-2 py-0.5 text-[10px] font-medium text-accentMint">
                +{stats.hoursDelta.toFixed(1)} this week
              </span>
            ) : (
              <span className="rounded-full bg-accentRed/20 px-2 py-0.5 text-[10px] font-medium text-accentRed">
                {stats.hoursDelta.toFixed(1)} this week
              </span>
            )}
          </div>
        </div>

        {/* Streak */}
        <div className="glass rounded-2xl p-6">
          <div className="mb-1 font-monoData text-3xl font-medium text-textPrimary">
            <CountUp end={stats.streak} />
          </div>
          <div className="mb-2 text-xs font-medium text-textMuted">day streak</div>
          <div className="text-[10px] text-textFaint">personal best</div>
        </div>

        {/* Flow Ratio */}
        <div className="glass rounded-2xl p-6">
          <div className="mb-1 font-monoData text-3xl font-medium text-textPrimary">
            <CountUp end={stats.avgFlowRatio * 100} decimals={0} suffix="%" />
          </div>
          <div className="mb-2 text-xs font-medium text-textMuted">avg flow ratio</div>
          <div className="flex items-center gap-1.5">
            {stats.flowDelta >= 0 ? (
              <span className="rounded-full bg-accentMint/20 px-2 py-0.5 text-[10px] font-medium text-accentMint">
                ▲ +{Math.round(stats.flowDelta * 100)}% vs last wk
              </span>
            ) : (
              <span className="rounded-full bg-accentRed/20 px-2 py-0.5 text-[10px] font-medium text-accentRed">
                ▼ {Math.round(stats.flowDelta * 100)}% vs last wk
              </span>
            )}
          </div>
        </div>
      </motion.div>
    </section>
  );
}
