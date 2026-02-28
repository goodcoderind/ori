import { motion, AnimatePresence } from 'framer-motion';

interface DashboardLoaderProps {
  isLoading: boolean;
}

export function DashboardLoader({ isLoading }: DashboardLoaderProps) {
  const greeting = (() => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  })();

  return (
    <AnimatePresence>
      {isLoading && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.5 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-background"
          data-loader-active={isLoading ? "true" : "false"}
        >
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.6, ease: [0.4, 0, 0.2, 1] }}
            className="text-center"
          >
            <motion.div
              animate={{
                scale: [1, 1.05, 1],
                opacity: [0.8, 1, 0.8],
              }}
              transition={{
                duration: 2,
                repeat: Infinity,
                ease: 'easeInOut',
              }}
              className="mb-8"
            >
              <div className="font-serifDisplay text-5xl md:text-6xl lg:text-7xl italic text-textPrimary mb-4">
                {greeting} Shamam.
              </div>
              <div className="font-serifDisplay text-2xl md:text-3xl lg:text-4xl italic text-textMuted">
                Here&apos;s how you&apos;ve been learning.
              </div>
            </motion.div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
