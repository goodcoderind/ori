import { motion } from 'framer-motion';
import { useDashboard } from '../hooks/useDashboard';
import { Spinner } from '../components/ui/Spinner';
import { ErrorCard } from '../components/ui/ErrorCard';
import { EmptyState } from '../components/ui/EmptyState';
import { ErrorBoundary } from '../components/ui/ErrorBoundary';
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

export function Dashboard() {
  const { summary, sessions, loading, error, refetch } = useDashboard();

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-8">
        <ErrorCard
          message={error}
          onRetry={refetch}
        />
      </div>
    );
  }

  if (loading && !summary) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (!summary) {
    return (
      <div className="min-h-screen flex items-center justify-center p-8">
        <EmptyState />
      </div>
    );
  }

  return (
    <ErrorBoundary>
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.6 }}
      className="w-full"
    >
      {/* Bento Grid Layout */}
      <div className="grid grid-cols-12 grid-rows-[auto_auto_auto_auto] gap-2 lg:gap-3">
        
        {/* Row 1: Hero Stats - Full Width */}
        <div className="col-span-12">
          <HeroStrip summary={summary} sessions={sessions} />
        </div>

        {/* Row 2: Focus Rhythm + Calendar Heatmap */}
        {/* Focus Rhythm - Large left card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="col-span-12 lg:col-span-6 bento-cell bento-cell-indigo p-4"
        >
          <FocusRhythmChart summary={summary} sessions={sessions} />
        </motion.div>

        {/* Calendar Heatmap - Right side */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.15 }}
          className="col-span-12 lg:col-span-6 bento-cell bento-cell-teal p-4"
        >
          <CalendarHeatmap sessions={sessions} />
        </motion.div>

        {/* Row 3: Multiple smaller cards */}
        {/* Focus Donut */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="col-span-12 md:col-span-6 lg:col-span-4 bento-cell bento-cell-purple p-4"
        >
          <FocusDonut summary={summary} />
        </motion.div>

        {/* Focus Heatmap */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.25 }}
          className="col-span-12 md:col-span-6 lg:col-span-4 bento-cell bento-cell-blue p-4"
        >
          <FocusHeatmap summary={summary} />
        </motion.div>

        {/* Upcoming Reviews */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="col-span-12 lg:col-span-4 bento-cell bento-cell-amber p-4"
        >
          <UpcomingReviews summary={summary} />
        </motion.div>

        {/* Row 4: Techniques - Wide card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.35 }}
          className="col-span-12 lg:col-span-8 bento-cell bento-cell-indigo p-4"
        >
          <TechniqueTable summary={summary} />
        </motion.div>

        {/* Session List - Smaller card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.4 }}
          className="col-span-12 lg:col-span-4 bento-cell bento-cell-mint p-4"
        >
          <SessionList sessions={sessions} />
        </motion.div>

        {/* Row 5: Topics - Full width */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.45 }}
          className="col-span-12 bento-cell bento-cell-purple p-4"
        >
          <TopicMindmap summary={summary} sessions={sessions} />
        </motion.div>

        {/* Row 6: Learner DNA - Full width */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.5 }}
          className="col-span-12 bento-cell bento-cell-teal p-4"
        >
          <LearnerDNA summary={summary} sessions={sessions} />
        </motion.div>

      </div>
    </motion.div>
    </ErrorBoundary>
  );
}
