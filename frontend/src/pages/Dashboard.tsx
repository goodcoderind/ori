import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useDashboard } from '../hooks/useDashboard';
import { Spinner } from '../components/ui/Spinner';
import { ErrorCard } from '../components/ui/ErrorCard';
import { EmptyState } from '../components/ui/EmptyState';
import { HeroStrip } from '../components/dashboard/HeroStrip';
import { FocusRhythmChart } from '../components/dashboard/FocusRhythmChart';
import { CalendarHeatmap } from '../components/dashboard/CalendarHeatmap';
import { FocusDonut } from '../components/dashboard/FocusDonut';
import { FocusHeatmap } from '../components/dashboard/FocusHeatmap';
import { TechniqueTable } from '../components/dashboard/TechniqueTable';
import { TopicMindmap } from '../components/dashboard/TopicMindmap';
import { LearnerDNA } from '../components/dashboard/LearnerDNA';
import { UpcomingReviews } from '../components/dashboard/UpcomingReviews';
import { SessionList } from '../components/dashboard/SessionList';

function scrollWithinDashboard(sectionId?: string) {
  const container = document.getElementById('app-main-scroll');
  if (!container) return;

  if (!sectionId) {
    container.scrollTo({ top: 0, behavior: 'smooth' });
    return;
  }

  const target = document.getElementById(sectionId);
  if (!target) return;

  const containerRect = container.getBoundingClientRect();
  const targetRect = target.getBoundingClientRect();
  const offset = targetRect.top - containerRect.top + container.scrollTop - 16;

  container.scrollTo({ top: offset, behavior: 'smooth' });
}

export function Dashboard() {
  const { summary, sessions, loading, error, refetch } = useDashboard();
  const location = useLocation();

  useEffect(() => {
    const state = location.state as { scrollTo?: string } | null;
    if (!summary || !state?.scrollTo) return;
    // scroll after layout has rendered
    const handle = window.requestAnimationFrame(() => {
      scrollWithinDashboard(state.scrollTo);
    });
    return () => window.cancelAnimationFrame(handle);
  }, [location.state, summary]);

  if (error) {
    return (
      <ErrorCard
        message={error}
        onRetry={refetch}
      />
    );
  }

  if (loading && !summary) {
    return <Spinner />;
  }

  if (!summary) {
    return <EmptyState />;
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6 }}
      className="space-y-8 pb-12"
    >
      {/* Section 1: Hero Strip */}
      <HeroStrip summary={summary} sessions={sessions} />

      {/* Section 2: Focus Rhythm - THE CENTERPIECE */}
      <FocusRhythmChart summary={summary} sessions={sessions} />

      {/* Section 3: Two-Column Row - Calendar + Time of Day */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[60%_40%]">
        <CalendarHeatmap sessions={sessions} />
        <FocusHeatmap summary={summary} />
      </div>

      {/* Section 4: Three-Column Row - State Distribution + Day of Week + Focus Depth */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <FocusDonut summary={summary} />
        <div className="relative">
          {/* Day of Week Heatmap - placeholder for now */}
          <div className="glass rounded-2xl p-6">
            <div className="text-xs font-medium uppercase tracking-[0.16em] text-textMuted">
              Day of Week
            </div>
            <div className="mt-4 space-y-2">
              {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day, i) => {
                const score = 0.4 + (i === 2 ? 0.3 : 0) - (i === 4 ? 0.2 : 0); // Mock data
                return (
                  <div key={day} className="flex items-center gap-3">
                    <div className="w-16 text-xs text-textMuted">{day}</div>
                    <div className="flex-1">
                      <div
                        className="h-6 rounded"
                        style={{
                          width: `${score * 100}%`,
                          backgroundColor: score > 0.7 ? '#52C99A' : score > 0.5 ? '#7C6EF5' : '#F0A55A',
                          opacity: 0.6 + score * 0.4,
                        }}
                      />
                    </div>
                    {i === 2 && <span className="text-xs">👑</span>}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
        <div className="relative">
          {/* Focus Depth Gauge - placeholder */}
          <div className="glass rounded-2xl p-6">
            <div className="text-xs font-medium uppercase tracking-[0.16em] text-textMuted">
              Focus Depth
            </div>
            <div className="mt-4 flex items-center justify-center">
              <div className="relative h-32 w-32">
                <svg className="h-32 w-32 -rotate-90 transform">
                  <circle
                    cx="64"
                    cy="64"
                    r="56"
                    fill="none"
                    stroke="#26263A"
                    strokeWidth="8"
                  />
                  <circle
                    cx="64"
                    cy="64"
                    r="56"
                    fill="none"
                    stroke="#52C99A"
                    strokeWidth="8"
                    strokeDasharray={`${2 * Math.PI * 56 * 0.78} ${2 * Math.PI * 56}`}
                    strokeLinecap="round"
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="font-monoData text-2xl font-medium text-textPrimary">78</span>
                </div>
              </div>
            </div>
            <div className="mt-2 text-center text-xs text-textMuted">
              Above 78% of learners
            </div>
          </div>
        </div>
      </div>

      {/* Techniques - full width with better visual hierarchy */}
      <div className="relative">
        <div className="absolute -left-8 top-0 h-full w-px bg-gradient-to-b from-transparent via-accentAmber/20 to-transparent" />
        <TechniqueTable summary={summary} />
      </div>

      {/* Topics Mindmap - the star of the show */}
      <TopicMindmap summary={summary} sessions={sessions} />

      {/* Section 7: Learner DNA */}
      <LearnerDNA summary={summary} sessions={sessions} />

      {/* Reviews and Sessions - side by side */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2" id="sessions">
        <UpcomingReviews summary={summary} />
        <SessionList sessions={sessions} />
      </div>
    </motion.div>
  );
}

