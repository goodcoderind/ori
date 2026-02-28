import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useState } from 'react';

export function Landing() {
  const navigate = useNavigate();
  const [isHovered, setIsHovered] = useState(false);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6">
      <div className="mx-auto max-w-3xl text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
        >
          <h1 className="mb-4 font-serifDisplay text-6xl italic tracking-tight text-accentViolet md:text-7xl lg:text-8xl">
            DeepIt
          </h1>
        </motion.div>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.2, ease: 'easeOut' }}
          className="mb-12 font-serifDisplay text-2xl italic text-textMuted md:text-3xl lg:text-4xl"
        >
          It's not what you learn. It's how you learn.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.4, ease: 'easeOut' }}
        >
          <button
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            onClick={() => navigate('/onboarding')}
            className="group relative overflow-hidden rounded-full border-2 border-accentViolet bg-surface px-8 py-4 font-sansUi text-lg font-medium text-textPrimary transition-all duration-300 hover:bg-accentViolet hover:text-background"
          >
            <motion.span
              className="relative z-10"
              animate={{ x: isHovered ? 0 : 0 }}
            >
              Start learning
            </motion.span>
            <motion.div
              className="absolute inset-0 bg-accentViolet"
              initial={{ x: '-100%' }}
              animate={{ x: isHovered ? '0%' : '-100%' }}
              transition={{ duration: 0.3 }}
            />
          </button>
        </motion.div>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8, delay: 0.6 }}
          className="mt-6 text-sm text-textFaint"
        >
          No email required
        </motion.p>
      </div>
    </div>
  );
}
