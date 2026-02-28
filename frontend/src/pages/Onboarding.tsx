import { motion, AnimatePresence } from 'framer-motion';
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useOnboarding } from '../hooks/useOnboarding';

type Step = 'topic' | 'learning-style' | 'complete';

export function Onboarding() {
  const navigate = useNavigate();
  const { isComplete, completeOnboarding } = useOnboarding();

  useEffect(() => {
    if (isComplete) {
      navigate('/dashboard', { replace: true });
    }
  }, [isComplete, navigate]);
  const [step, setStep] = useState<Step>('topic');
  const [topic, setTopic] = useState('');
  const [learningStyle, setLearningStyle] = useState<'procedural' | 'exploratory' | 'hybrid' | null>(null);
  const [showOri, setShowOri] = useState(false);
  const [showInput, setShowInput] = useState(false);
  const [showOptions, setShowOptions] = useState(false);

  useEffect(() => {
    // Animate Ori appearing
    const timer1 = setTimeout(() => setShowOri(true), 300);
    const timer2 = setTimeout(() => setShowInput(true), 1000);
    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
    };
  }, [step]);

  const handleTopicSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (topic.trim()) {
      setShowInput(false);
      setTimeout(() => {
        setStep('learning-style');
        setShowOri(false);
        setShowInput(false);
        setShowOptions(false);
        setTimeout(() => {
          setShowOri(true);
          setTimeout(() => setShowOptions(true), 800);
        }, 300);
      }, 500);
    }
  };

  const handleStyleSelect = (style: 'procedural' | 'exploratory' | 'hybrid') => {
    setLearningStyle(style);
    setShowOptions(false);
    setTimeout(() => {
      completeOnboarding({ topic: topic.trim(), learningStyle: style });
      setStep('complete');
      setTimeout(() => {
        navigate('/dashboard');
      }, 1500);
    }, 500);
  };

  return (
    <div className="relative min-h-screen bg-background">
      {/* ORI Branding - Fixed at top, always visible, never disappears */}
      <div className="absolute top-12 left-0 right-0 z-10 text-center">
        <h1 className="mb-2 font-serifDisplay text-4xl italic tracking-tight text-accentViolet md:text-5xl lg:text-6xl">
          ORI
        </h1>
        <p className="font-serifDisplay text-lg italic text-textMuted md:text-xl lg:text-2xl">
          It&apos;s not what you learn. It&apos;s how you learn.
        </p>
      </div>

      {/* Content area - centered */}
      <div className="flex min-h-screen items-center justify-center px-6 py-12">
        <div className="mx-auto w-full max-w-2xl pt-24">
        <AnimatePresence mode="wait">
          {step === 'topic' && (
            <motion.div
              key="topic"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.4 }}
              className="space-y-6"
            >
              {showOri && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.5, type: 'spring' }}
                  className="flex items-start gap-4"
                >
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-surfaceRaised border border-borderSubtle">
                    <span className="text-2xl">👁️</span>
                  </div>
                  <div className="flex-1 rounded-2xl bg-surfaceRaised border border-borderSubtle p-6">
                    <p className="text-textPrimary leading-relaxed">
                      Before we start — what are you studying right now? Just tell me the subject, or paste in a topic you've been staring at.
                    </p>
                  </div>
                </motion.div>
              )}

              {showInput && (
                <motion.form
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 }}
                  onSubmit={handleTopicSubmit}
                  className="flex gap-3"
                >
                  <input
                    type="text"
                    value={topic}
                    onChange={(e) => setTopic(e.target.value)}
                    placeholder="e.g., Cellular respiration, biology A-levels"
                    autoFocus
                    className="flex-1 rounded-lg border border-borderSubtle bg-surface px-4 py-3 font-sansUi text-textPrimary placeholder:text-textFaint focus:border-accentViolet focus:outline-none focus:ring-2 focus:ring-accentViolet/20"
                  />
                  <button
                    type="submit"
                    disabled={!topic.trim()}
                    className="rounded-lg border border-accentViolet bg-accentViolet px-6 py-3 font-sansUi font-medium text-background transition-opacity disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90"
                  >
                    Continue
                  </button>
                </motion.form>
              )}
            </motion.div>
          )}

          {step === 'learning-style' && (
            <motion.div
              key="learning-style"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.4 }}
              className="space-y-6"
            >
              {showOri && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.5, type: 'spring' }}
                  className="flex items-start gap-4"
                >
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-surfaceRaised border border-borderSubtle">
                    <span className="text-2xl">👁️</span>
                  </div>
                  <div className="flex-1 rounded-2xl bg-surfaceRaised border border-borderSubtle p-6">
                    <p className="text-textPrimary leading-relaxed">
                      Got it. One more thing — when you're stuck, do you usually want someone to explain it to you, or would you rather figure it out yourself with a nudge?
                    </p>
                  </div>
                </motion.div>
              )}

              {showOptions && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 }}
                  className="space-y-3"
                >
                  <button
                    onClick={() => handleStyleSelect('procedural')}
                    className="w-full rounded-lg border border-borderSubtle bg-surface px-6 py-4 text-left font-sansUi text-textPrimary transition-all hover:border-accentViolet hover:bg-surfaceRaised"
                  >
                    Explain it to me
                  </button>
                  <button
                    onClick={() => handleStyleSelect('exploratory')}
                    className="w-full rounded-lg border border-borderSubtle bg-surface px-6 py-4 text-left font-sansUi text-textPrimary transition-all hover:border-accentViolet hover:bg-surfaceRaised"
                  >
                    Give me a nudge and I'll find it
                  </button>
                  <button
                    onClick={() => handleStyleSelect('hybrid')}
                    className="w-full rounded-lg border border-borderSubtle bg-surface px-6 py-4 text-left font-sansUi text-textPrimary transition-all hover:border-accentViolet hover:bg-surfaceRaised"
                  >
                    Depends on how stuck I am
                  </button>
                </motion.div>
              )}
            </motion.div>
          )}

          {step === 'complete' && (
            <motion.div
              key="complete"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5 }}
              className="text-center"
            >
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.2, type: 'spring', stiffness: 200 }}
                className="mb-6 flex justify-center"
              >
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-accentViolet/20">
                  <span className="text-3xl">✨</span>
                </div>
              </motion.div>
              <p className="font-serifDisplay text-xl italic text-textPrimary">
                That's it. You're all set.
              </p>
            </motion.div>
          )}
        </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
