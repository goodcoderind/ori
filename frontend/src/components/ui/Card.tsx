import type { ReactNode } from 'react';
import { motion } from 'framer-motion';

interface CardProps {
  children: ReactNode;
  hoverable?: boolean;
  accentColor?: string;
  className?: string;
}

export function Card({ children, hoverable, accentColor, className }: CardProps) {
  const base =
    'relative rounded-2xl px-6 py-6 transition-all duration-300';
  const hover = hoverable ? 'hover:scale-[1.02] hover:-translate-y-1' : '';

  return (
    <motion.div
      className={`${base} ${hover} ${className ?? ''}`}
      style={accentColor ? { 
        borderLeft: `3px solid ${accentColor}`,
        boxShadow: `inset 0 0 20px ${accentColor}15, 0 8px 32px rgba(0, 0, 0, 0.3)`
      } : {
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)'
      }}
      whileHover={hoverable ? { scale: 1.01 } : undefined}
      transition={{ type: 'spring', stiffness: 260, damping: 22 }}
    >
      {children}
    </motion.div>
  );
}

