import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import type { ReactNode } from 'react';

interface ExpandableCardProps {
  id: string;
  children: ReactNode;
  expandedContent: ReactNode;
  className?: string;
}

export function ExpandableCard({ id, children, expandedContent, className = '' }: ExpandableCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [transformOrigin, setTransformOrigin] = useState('center center');
  const cardRef = useRef<HTMLDivElement>(null);

  // Handle ESC key
  useEffect(() => {
    if (!isExpanded) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsExpanded(false);
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isExpanded]);

  // Capture card position and calculate transform origin
  const handleClick = () => {
    if (cardRef.current) {
      const rect = cardRef.current.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      
      // Calculate transform origin as percentage
      const originX = (centerX / viewportWidth) * 100;
      const originY = (centerY / viewportHeight) * 100;
      setTransformOrigin(`${originX}% ${originY}%`);
      setIsExpanded(true);
    }
  };

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (isExpanded) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isExpanded]);

  return (
    <>
      {/* Card in grid */}
      <motion.div
        ref={cardRef}
        onClick={handleClick}
        className={`cursor-pointer ${className}`}
        whileHover={{ scale: 1.02, y: -2 }}
        transition={{ type: 'spring', stiffness: 300, damping: 25 }}
        layoutId={isExpanded ? `card-${id}` : undefined}
      >
        {children}
      </motion.div>

      {/* Modal overlay and expanded content - Portal to body */}
      {typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          {isExpanded && (
            <>
              {/* Backdrop */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.35, ease: [0.4, 0, 0.2, 1] }}
                className="fixed inset-0 z-50 bg-black/50 backdrop-blur-md"
                onClick={() => setIsExpanded(false)}
              />

              {/* Expanded modal */}
              <motion.div
                initial={{ 
                  scale: 0.85,
                  opacity: 0,
                  borderRadius: 20,
                  x: '-50%',
                  y: '-50%',
                }}
                animate={{ 
                  scale: 1,
                  opacity: 1,
                  borderRadius: 28,
                  x: '-50%',
                  y: '-50%',
                }}
                exit={{ 
                  scale: 0.85,
                  opacity: 0,
                  borderRadius: 20,
                  x: '-50%',
                  y: '-50%',
                }}
                transition={{ 
                  type: 'spring',
                  stiffness: 300,
                  damping: 30,
                  duration: 0.35,
                }}
                className="fixed top-1/2 left-1/2 z-50 overflow-hidden flex flex-col"
                style={{
                  width: 'min(1000px, 90vw)',
                  maxHeight: '85vh',
                  transformOrigin: 'center center',
                  background: 'rgba(28, 28, 40, 0.95)',
                  backdropFilter: 'blur(20px) saturate(180%)',
                  WebkitBackdropFilter: 'blur(20px) saturate(180%)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  boxShadow: '0 40px 120px rgba(0, 0, 0, 0.6), inset 0 1px 0 rgba(255, 255, 255, 0.1)',
                }}
                onClick={(e) => e.stopPropagation()}
              >
                {/* Close button */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsExpanded(false);
                  }}
                  className="absolute top-6 right-6 z-10 w-10 h-10 rounded-full glass border border-white/10 flex items-center justify-center text-textPrimary transition-all hover:border-white/20 hover:shadow-lg hover:scale-110"
                  aria-label="Close"
                >
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 20 20"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <line x1="5" y1="5" x2="15" y2="15" />
                    <line x1="15" y1="5" x2="5" y2="15" />
                  </svg>
                </button>

                {/* Scrollable content */}
                <div className="flex-1 overflow-y-auto" style={{ padding: '40px' }}>
                  {expandedContent}
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>,
        document.body
      )}
    </>
  );
}
