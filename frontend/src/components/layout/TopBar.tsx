import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export function TopBar() {
  const [isVisible, setIsVisible] = useState(false);
  const greeting = (() => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  })();

  useEffect(() => {
    // Check if loader is done by checking data attribute
    const checkVisibility = () => {
      const loaderVisible = document.querySelector('[data-loader-active="true"]');
      setIsVisible(!loaderVisible);
    };

    // Check initially
    checkVisibility();

    // Check periodically
    const interval = setInterval(checkVisibility, 100);

    return () => clearInterval(interval);
  }, []);

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.header
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          transition={{ duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
          className="flex-shrink-0 h-16 z-30 flex items-center border-b border-white/10 glass-strong px-8 backdrop-blur-xl"
        >
          <div className="flex flex-col gap-0.5">
            <span className="text-xs font-medium text-textMuted leading-tight">
          {greeting} Shamam.
        </span>
            <span className="font-serifDisplay text-xl italic leading-tight text-textPrimary">
              Here&apos;s how you&apos;ve been learning.
        </span>
      </div>
        </motion.header>
      )}
    </AnimatePresence>
  );
}
