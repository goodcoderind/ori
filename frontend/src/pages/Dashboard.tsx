import { motion, AnimatePresence } from 'framer-motion';
import { useState, useEffect } from 'react';
import { useDashboard } from '../hooks/useDashboard';
import { Spinner } from '../components/ui/Spinner';
import { ErrorCard } from '../components/ui/ErrorCard';
import { EmptyState } from '../components/ui/EmptyState';
<<<<<<< HEAD
import { DashboardLoader } from '../components/ui/DashboardLoader';
import { ExpandableCard } from '../components/ui/ExpandableCard';
=======
import { ErrorBoundary } from '../components/ui/ErrorBoundary';
>>>>>>> d81562fe67a177f293965a8a33cd5d6f58974f46
import { HeroStrip } from '../components/dashboard/HeroStrip';
import { FocusRhythmChart } from '../components/dashboard/FocusRhythmChart';
import { FocusDonut } from '../components/dashboard/FocusDonut';
import { FocusHeatmap } from '../components/dashboard/FocusHeatmap';
import { TechniqueTable } from '../components/dashboard/TechniqueTable';
import { TopicMindmap } from '../components/dashboard/TopicMindmap';
import { LearnerDNA } from '../components/dashboard/LearnerDNA';
import { UpcomingReviews } from '../components/dashboard/UpcomingReviews';
import { SessionList } from '../components/dashboard/SessionList';
import pandaImage from '../panda.png';

export function Dashboard() {
  const { summary, sessions, loading, error, refetch } = useDashboard();
  const [showLoader, setShowLoader] = useState(true);
  const [showContent, setShowContent] = useState(false);

  useEffect(() => {
    if (!loading && summary) {
      // Show loader for at least 1.5 seconds for smooth experience
      const timer = setTimeout(() => {
        setShowLoader(false);
        // Small delay before showing content for smooth transition
        setTimeout(() => {
          setShowContent(true);
        }, 300);
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [loading, summary]);

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

  if (!summary && loading) {
    return (
      <>
        <DashboardLoader isLoading={true} />
      </>
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
<<<<<<< HEAD
    <>
      <DashboardLoader isLoading={showLoader} />
      <AnimatePresence>
        {showContent && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.8, ease: [0.4, 0, 0.2, 1] }}
            className="w-full h-full overflow-hidden"
          >
      {/* Bento Grid Layout - Everything fits on one screen */}
      <div className="grid grid-cols-12 grid-rows-5 gap-3 h-full p-3">
=======
    <ErrorBoundary>
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.6 }}
      className="w-full"
    >
      {/* Bento Grid Layout */}
      <div className="grid grid-cols-12 grid-rows-[auto_auto_auto_auto] gap-2 lg:gap-3">
>>>>>>> d81562fe67a177f293965a8a33cd5d6f58974f46
        
        {/* Row 1: Hero Stats - Not expandable */}
        <div className="col-span-12 row-span-1">
          <HeroStrip summary={summary} sessions={sessions} />
        </div>

<<<<<<< HEAD
        {/* Row 2-3: Left side + Center Panda + Right side */}
        {/* Focus Rhythm - Left */}
        <ExpandableCard
          id="focus-rhythm"
          className="col-span-12 lg:col-span-5 row-span-2"
          expandedContent={
            <div className="w-full min-h-full">
              <FocusRhythmChart summary={summary} sessions={sessions} />
            </div>
          }
=======
        {/* Row 2: Focus Rhythm + Calendar Heatmap */}
        {/* Focus Rhythm - Large left card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="col-span-12 lg:col-span-6 bento-cell bento-cell-indigo p-4"
>>>>>>> d81562fe67a177f293965a8a33cd5d6f58974f46
        >
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="bento-cell bento-cell-indigo p-4 h-full"
          >
            <FocusRhythmChart summary={summary} sessions={sessions} />
          </motion.div>
        </ExpandableCard>

<<<<<<< HEAD
        {/* Center Panda - Not expandable */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6, delay: 0.2, type: "spring", stiffness: 100 }}
          className="col-span-12 lg:col-span-2 row-span-2 panda-center-cell flex flex-col items-center justify-center"
        >
          <div className="panda-image-container flex flex-col items-center justify-center">
            <img src={pandaImage} alt="Panda" className="w-3/4 h-3/4 object-contain" />
            <div className="text-center -mt-1">
              <div className="font-serifDisplay text-xl italic text-textPrimary">
                Shamam&apos;s ORI
              </div>
            </div>
          </div>
        </motion.div>

        {/* Right side - Two stacked cards */}
        {/* Focus Donut - Top right */}
        <ExpandableCard
          id="focus-donut"
          className="col-span-12 lg:col-span-5 row-span-1"
          expandedContent={
            <div className="w-full min-h-full">
              <div className="mb-8">
                <div className="text-sm font-medium uppercase tracking-[0.16em] text-textMuted mb-2">
                  Focus States
                </div>
                <div className="font-serifDisplay text-3xl italic text-textPrimary">
                  Where your mind lives while you learn
                </div>
              </div>
              <div className="flex flex-col gap-6 md:flex-row">
                <div className="h-80 flex-1">
                  <FocusDonut summary={summary} compact={false} />
                </div>
              </div>
            </div>
          }
=======
        {/* Calendar Heatmap - Right side */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.15 }}
          className="col-span-12 lg:col-span-6 bento-cell bento-cell-teal p-4"
>>>>>>> d81562fe67a177f293965a8a33cd5d6f58974f46
        >
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, delay: 0.15 }}
            className="bento-cell bento-cell-purple p-4 h-full"
          >
            <FocusDonut summary={summary} compact={true} />
          </motion.div>
        </ExpandableCard>

        {/* Focus Heatmap - Bottom right */}
        <ExpandableCard
          id="focus-heatmap"
          className="col-span-12 lg:col-span-5 row-span-1"
          expandedContent={
            <div className="w-full min-h-full">
              <div className="mb-8">
                <div className="text-sm font-medium uppercase tracking-[0.16em] text-textMuted mb-2">
                  Time of Day
                </div>
                <div className="font-serifDisplay text-3xl italic text-textPrimary">
                  When your focus tends to hold
                </div>
              </div>
              <div className="h-80">
                <FocusHeatmap summary={summary} compact={false} />
              </div>
            </div>
          }
        >
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="bento-cell bento-cell-blue p-4 h-full"
          >
            <FocusHeatmap summary={summary} compact={true} />
          </motion.div>
        </ExpandableCard>

        {/* Row 4: Smaller cards */}
        {/* Upcoming Reviews */}
        <ExpandableCard
          id="upcoming-reviews"
          className="col-span-12 md:col-span-6 lg:col-span-4 row-span-1"
          expandedContent={
            <div className="w-full">
              <div className="mb-6">
                <div className="text-sm font-medium uppercase tracking-[0.16em] text-textMuted mb-2">
                  Upcoming Reviews
                </div>
                <div className="font-serifDisplay text-3xl italic text-textPrimary">
                  Keeping ideas from fading
                </div>
              </div>
              <UpcomingReviews summary={summary} />
            </div>
          }
        >
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.25 }}
            className="bento-cell bento-cell-amber p-4 h-full"
          >
            <UpcomingReviews summary={summary} />
          </motion.div>
        </ExpandableCard>

        {/* Session List */}
        <ExpandableCard
          id="session-list"
          className="col-span-12 md:col-span-6 lg:col-span-4 row-span-1"
          expandedContent={
            <div className="w-full">
              <div className="mb-6">
                <div className="text-sm font-medium uppercase tracking-[0.16em] text-textMuted mb-2">
                  Session Feed
                </div>
                <div className="font-serifDisplay text-3xl italic text-textPrimary">
                  Your recent learning
                </div>
              </div>
              <SessionList sessions={sessions} />
            </div>
          }
        >
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
            className="bento-cell bento-cell-mint p-4 h-full"
          >
            <SessionList sessions={sessions} />
          </motion.div>
        </ExpandableCard>

        {/* Techniques */}
        <ExpandableCard
          id="techniques"
          className="col-span-12 md:col-span-6 lg:col-span-4 row-span-1"
          expandedContent={
            <div className="w-full">
              <div className="mb-6">
                <div className="text-sm font-medium uppercase tracking-[0.16em] text-textMuted mb-2">
                  Techniques
                </div>
                <div className="font-serifDisplay text-3xl italic text-textPrimary">
                  What actually works for you
                </div>
              </div>
              <TechniqueTable summary={summary} />
            </div>
          }
        >
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.35 }}
            className="bento-cell bento-cell-indigo p-4 h-full"
          >
            <TechniqueTable summary={summary} />
          </motion.div>
        </ExpandableCard>

        {/* Row 5: Bottom wide cards */}
        {/* Topics */}
        <ExpandableCard
          id="topics"
          className="col-span-12 lg:col-span-6 row-span-1"
          expandedContent={
            <div className="w-full">
              <div className="mb-6">
                <div className="text-sm font-medium uppercase tracking-[0.16em] text-textMuted mb-2">
                  Topics
                </div>
                <div className="font-serifDisplay text-3xl italic text-textPrimary">
                  Your learning landscape
                </div>
              </div>
              <TopicMindmap summary={summary} sessions={sessions} />
            </div>
          }
        >
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.4 }}
            className="bento-cell bento-cell-purple p-4 h-full"
          >
            <TopicMindmap summary={summary} sessions={sessions} />
          </motion.div>
        </ExpandableCard>

        {/* Learner DNA */}
        <ExpandableCard
          id="learner-dna"
          className="col-span-12 lg:col-span-6 row-span-1"
          expandedContent={
            <div className="w-full">
              <div className="mb-6">
                <div className="text-sm font-medium uppercase tracking-[0.16em] text-textMuted mb-2">
                  Learner DNA
                </div>
                <div className="font-serifDisplay text-3xl italic text-textPrimary">
                  Who you are as a learner
                </div>
              </div>
              <LearnerDNA summary={summary} sessions={sessions} />
            </div>
          }
        >
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.45 }}
            className="bento-cell bento-cell-teal p-4 h-full"
          >
            <LearnerDNA summary={summary} sessions={sessions} />
          </motion.div>
        </ExpandableCard>

<<<<<<< HEAD
          </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
=======
      </div>
    </motion.div>
    </ErrorBoundary>
>>>>>>> d81562fe67a177f293965a8a33cd5d6f58974f46
  );
}
